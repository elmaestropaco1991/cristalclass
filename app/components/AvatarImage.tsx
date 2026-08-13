import Image from "next/image";
import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";
import type { Avatar } from "../types/student";

type Props = {
  avatar: Avatar;
  seed: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
};

export default function AvatarImage({
  avatar,
  seed,
  alt,
  width,
  height,
  className,
}: Props) {
  const svg = createAvatar(adventurer, {
    seed: `${avatar.id}-${seed}`,
  }).toDataUri();

  return (
    <Image
      src={svg}
      alt={alt}
      width={width}
      height={height}
      className={className}
      draggable={false}
      loading="eager"
      unoptimized
    />
  );
}
