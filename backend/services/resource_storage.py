from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from backend.db import uploads_dir


async def store_resource_file(
    *,
    upload: UploadFile,
    course_id: str,
    session_id: str | None,
) -> dict[str, str | int | None]:
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    file_name = upload.filename or f"resource-{uuid4()}"
    resource_key = f"courses/{course_id}/sessions/{session_id or 'general'}/{uuid4()}-{file_name}"
    mime_type = upload.content_type or "application/octet-stream"

    local_path = uploads_dir / resource_key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    return {
        "url": f"/uploads/{resource_key}",
        "storage_path": str(local_path.relative_to(Path(uploads_dir).parent)).replace('\\', '/'),
        "file_name": file_name,
        "mime_type": mime_type,
        "file_size_bytes": len(content),
    }
