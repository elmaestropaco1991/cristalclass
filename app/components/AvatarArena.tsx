import type { Student } from "../types/student";
import OrganicMagicDust from "./OrganicMagicDust";
import OrbitRing from "./OrbitRing";
import EquippedAvatar from "./EquippedAvatar";

type Props = {
  student: Student;
};

export default function AvatarArena({ student }: Props) {
  return (
    <div className="relative flex h-[700px] w-[700px] select-none items-center justify-center">
      <div className="absolute h-[650px] w-[650px] rounded-full bg-cyan-100/65 blur-[100px]" />
      <OrganicMagicDust />
      <OrbitRing />
      <div className="absolute h-[530px] w-[530px] overflow-hidden rounded-full border-2 border-white/75 bg-[radial-gradient(circle_at_46%_35%,rgba(255,255,255,.96),rgba(187,238,247,.63)_48%,rgba(75,153,199,.42)_100%)] shadow-[0_0_28px_rgba(255,255,255,.85),inset_0_0_34px_rgba(235,253,255,.55)]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,.48),transparent_42%),linear-gradient(180deg,transparent_52%,rgba(36,113,137,.22)_100%)]" />
        <div aria-hidden="true" className="absolute inset-6 rounded-full opacity-25 [background-image:repeating-conic-gradient(from_14deg,rgba(255,255,255,.68)_0deg_1deg,transparent_1deg_12deg)]" />
        <div aria-hidden="true" className="absolute bottom-0 h-[33%] w-full bg-[radial-gradient(ellipse_at_10%_100%,rgba(20,99,104,.34)_0_22%,transparent_23%),radial-gradient(ellipse_at_33%_100%,rgba(27,120,107,.28)_0_18%,transparent_19%),radial-gradient(ellipse_at_72%_100%,rgba(28,116,105,.3)_0_22%,transparent_23%),radial-gradient(ellipse_at_94%_100%,rgba(18,94,105,.32)_0_18%,transparent_19%)]" />
        <div aria-hidden="true" className="absolute bottom-[19%] left-[17%] h-14 w-7 rotate-[28deg] rounded-sm bg-[linear-gradient(135deg,rgba(235,255,255,.8),rgba(72,210,239,.45),rgba(40,113,195,.22))] opacity-55 [clip-path:polygon(50%_0,100%_28%,78%_100%,22%_100%,0_28%)]" />
        <div aria-hidden="true" className="absolute bottom-[24%] right-[18%] h-10 w-5 rotate-[-24deg] rounded-sm bg-[linear-gradient(135deg,rgba(255,255,255,.82),rgba(114,221,242,.48),rgba(54,109,201,.22))] opacity-50 [clip-path:polygon(50%_0,100%_28%,78%_100%,22%_100%,0_28%)]" />
        <div aria-hidden="true" className="absolute inset-12 rounded-full border border-cyan-50/60" />
      </div>
      <div className="absolute bottom-[77px] h-24 w-[310px] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(19,65,91,.46),rgba(19,65,91,0)_70%)] blur-xl" />
      <div className="absolute bottom-[92px] h-14 w-[260px] rounded-[50%] border border-cyan-50/55 bg-[radial-gradient(ellipse_at_center,rgba(232,253,255,.92),rgba(129,217,238,.3)_64%,transparent_72%)] shadow-[0_0_18px_rgba(163,241,255,.62)]" />
      <div aria-hidden="true" className="absolute bottom-[87px] h-8 w-[280px] rounded-[50%] border border-white/30 [background-image:repeating-conic-gradient(from_0deg,rgba(255,255,255,.45)_0deg_1deg,transparent_1deg_16deg)] opacity-65" />

      <div className="absolute bottom-[88px] z-20 h-[490px] w-[490px]">
        <EquippedAvatar
          student={student}
          className="h-full w-full"
          avatarClassName="drop-shadow-[0_30px_22px_rgba(25,74,100,.32)]"
        />
      </div>
    </div>
  );
}
