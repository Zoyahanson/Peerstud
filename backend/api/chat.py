from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from backend.api.schemas import (
    ChatContactResponse,
    ChatConversationCreate,
    ChatConversationSummaryResponse,
    ChatMessageCreate,
    ChatMessageResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import ChatMessage, Conversation, ConversationParticipant, User, UserProfile


router = APIRouter(prefix="/chat", tags=["chat"])


def _contact_payload(user: User, profile: UserProfile | None) -> ChatContactResponse:
    return ChatContactResponse(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        credibility_score=float(profile.credibility_score if profile else 0.0),
        ratings_count=int(profile.ratings_count if profile else 0),
    )


def _conversation_summary(
    *,
    conversation: Conversation,
    current_user: User,
    current_participant: ConversationParticipant,
) -> ChatConversationSummaryResponse:
    peer_participant = next(
        (item for item in conversation.participants if item.user_id != current_user.id),
        None,
    )
    if not peer_participant:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Conversation is missing a peer participant")

    last_message = max(conversation.messages, key=lambda item: item.created_at) if conversation.messages else None
    unread_count = sum(
        1
        for message in conversation.messages
        if message.sender_user_id != current_user.id and message.created_at > current_participant.last_read_at
    )

    return ChatConversationSummaryResponse(
        conversation_id=conversation.id,
        peer=_contact_payload(peer_participant.user, peer_participant.user.profile),
        last_message=last_message.content if last_message else None,
        last_message_at=last_message.created_at if last_message else None,
        unread_count=unread_count,
    )


@router.get("/contacts", response_model=list[ChatContactResponse])
def list_contacts(
    q: str | None = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatContactResponse]:
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="limit must be between 1 and 200")

    query = (
        db.query(User, UserProfile)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .filter(User.id != current_user.id)
    )

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(
            (User.full_name.ilike(pattern)) | (User.email.ilike(pattern))
        )

    users = (
        query
        .order_by(User.full_name.asc().nulls_last(), User.email.asc())
        .limit(limit)
        .all()
    )
    return [_contact_payload(user, profile) for user, profile in users]


@router.get("/conversations", response_model=list[ChatConversationSummaryResponse])
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatConversationSummaryResponse]:
    participations = (
        db.query(ConversationParticipant)
        .options(
            selectinload(ConversationParticipant.conversation)
            .selectinload(Conversation.participants)
            .selectinload(ConversationParticipant.user)
            .selectinload(User.profile),
            selectinload(ConversationParticipant.conversation).selectinload(Conversation.messages),
        )
        .filter(ConversationParticipant.user_id == current_user.id)
        .all()
    )

    summaries = [
        _conversation_summary(
            conversation=item.conversation,
            current_user=current_user,
            current_participant=item,
        )
        for item in participations
        if item.conversation.kind == "direct"
    ]
    summaries.sort(
        key=lambda item: item.last_message_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return summaries


@router.post("/conversations", response_model=ChatConversationSummaryResponse)
def create_or_open_direct_conversation(
    payload: ChatConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatConversationSummaryResponse:
    if str(payload.peer_user_id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create a conversation with yourself")

    peer_user = db.query(User).filter(User.id == payload.peer_user_id).first()
    if not peer_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peer user not found")

    my_participations = (
        db.query(ConversationParticipant)
        .options(
            selectinload(ConversationParticipant.conversation)
            .selectinload(Conversation.participants)
            .selectinload(ConversationParticipant.user)
            .selectinload(User.profile),
            selectinload(ConversationParticipant.conversation).selectinload(Conversation.messages),
        )
        .filter(ConversationParticipant.user_id == current_user.id)
        .all()
    )

    for participant in my_participations:
        conversation = participant.conversation
        if conversation.kind != "direct":
            continue
        if len(conversation.participants) != 2:
            continue
        if any(item.user_id == payload.peer_user_id for item in conversation.participants):
            return _conversation_summary(
                conversation=conversation,
                current_user=current_user,
                current_participant=participant,
            )

    conversation = Conversation(kind="direct")
    db.add(conversation)
    db.flush()

    my_participant = ConversationParticipant(conversation_id=conversation.id, user_id=current_user.id)
    peer_participant = ConversationParticipant(conversation_id=conversation.id, user_id=payload.peer_user_id)
    db.add(my_participant)
    db.add(peer_participant)
    db.commit()

    created = (
        db.query(ConversationParticipant)
        .options(
            selectinload(ConversationParticipant.conversation)
            .selectinload(Conversation.participants)
            .selectinload(ConversationParticipant.user)
            .selectinload(User.profile),
            selectinload(ConversationParticipant.conversation).selectinload(Conversation.messages),
        )
        .filter(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == current_user.id,
        )
        .first()
    )
    return _conversation_summary(
        conversation=created.conversation,
        current_user=current_user,
        current_participant=created,
    )


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageResponse])
def list_messages(
    conversation_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatMessageResponse]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="limit must be between 1 and 500")

    membership = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this conversation")

    messages = (
        db.query(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
        .all()
    )

    membership.last_read_at = datetime.now(timezone.utc)
    db.add(membership)
    db.commit()

    return [
        ChatMessageResponse(
            id=message.id,
            conversation_id=message.conversation_id,
            sender_user_id=message.sender_user_id,
            sender_full_name=message.sender.full_name,
            content=message.content,
            created_at=message.created_at,
        )
        for message in messages
    ]


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageResponse)
def send_message(
    conversation_id: str,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageResponse:
    membership = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this conversation")

    message = ChatMessage(
        conversation_id=conversation_id,
        sender_user_id=current_user.id,
        content=payload.content.strip(),
    )
    membership.last_read_at = datetime.now(timezone.utc)
    db.add(message)
    db.add(membership)
    db.commit()
    db.refresh(message)

    return ChatMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        sender_full_name=current_user.full_name,
        content=message.content,
        created_at=message.created_at,
    )
