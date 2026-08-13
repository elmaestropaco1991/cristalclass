import Image from "next/image";
import { getActionIcon } from "../data/actionIcons";

type Props = {
  icon?: string;
  iconId?: string;
};

export default function ActionIcon({ icon, iconId }: Props) {
  const configuredIcon = getActionIcon(iconId)?.glyph ?? icon?.trim();

  if (configuredIcon?.startsWith("/")) {
    return (
      <Image
        src={configuredIcon}
        alt=""
        width={44}
        height={44}
        unoptimized
        className="h-11 w-11 object-contain"
      />
    );
  }

  if (configuredIcon) {
    return (
      <span
        aria-hidden="true"
        className="text-[38px] leading-none"
        style={{ fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
      >
        {configuredIcon}
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      data-icon-id={iconId}
      className="h-9 w-9 fill-none stroke-sky-100 stroke-[3]"
    >
      <path d="m24 8 3.5 10.5L38 22l-10.5 3.5L24 36l-3.5-10.5L10 22l10.5-3.5L24 8Z" />
    </svg>
  );
}
