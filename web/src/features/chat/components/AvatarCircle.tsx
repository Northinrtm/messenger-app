type AvatarCircleProps = {
  className: string;
  name: string;
  avatarUrl?: string | null;
  badge?: string;
  online?: boolean;
};

export function AvatarCircle({
  className,
  name,
  avatarUrl = null,
  badge,
  online = false,
}: AvatarCircleProps) {
  return (
    <div className={`${className} ${avatarUrl ? "has-image" : avatarTone(name)}`}>
      {avatarUrl ? (
        <span className="avatar-image-shell">
          <img src={avatarUrl} alt={name} />
        </span>
      ) : (
        initials(name)
      )}
      {badge ? <span className="avatar-badge">{badge}</span> : null}
      {online ? <span className="avatar-presence" /> : null}
    </div>
  );
}

function initials(title: string) {
  return title
    .split(" ")
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarTone(seed: string) {
  const tones = ["tone-blue", "tone-violet", "tone-green", "tone-orange", "tone-rose"];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
}
