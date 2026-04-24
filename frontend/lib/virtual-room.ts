type VirtualRoomSeed = {
  courseId: string;
  classroomName: string;
  topicFocus: string;
  startTime: string;
};

const DEFAULT_ROOM_HOST = "https://meet.jit.si";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

export function buildVirtualRoomSlug(seed: VirtualRoomSeed): string {
  const course = slugify(seed.courseId).slice(0, 10);
  const room = slugify(seed.classroomName).slice(0, 12);
  const topic = slugify(seed.topicFocus).slice(0, 12);
  const stamp = new Date(seed.startTime).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `peerstud-${course}-${room}-${topic}-${stamp}`;
}

export function buildDefaultVirtualRoomUrl(seed: VirtualRoomSeed): string {
  return `${DEFAULT_ROOM_HOST}/${buildVirtualRoomSlug(seed)}`;
}
