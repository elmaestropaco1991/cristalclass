import styles from "./OrganicMagicDust.module.css";

type ParticleTone = "gold" | "cream" | "white" | "amber";
type ParticleFlow = "wide" | "side" | "low" | "loose";

type Particle = {
  x: number;
  y: number;
  size: number;
  tone: ParticleTone;
  flow: ParticleFlow;
};

const motionClass: Record<ParticleFlow, string> = {
  wide: styles.wide,
  side: styles.side,
  low: styles.low,
  loose: styles.loose,
};

const toneClass: Record<ParticleTone, string> = {
  gold: styles.gold,
  cream: styles.cream,
  white: styles.white,
  amber: styles.amber,
};

const particles: Particle[] = [
  { x: 12, y: 43, size: 3, tone: "gold", flow: "wide" },
  { x: 14, y: 30, size: 2, tone: "cream", flow: "wide" },
  { x: 20, y: 20, size: 4, tone: "white", flow: "wide" },
  { x: 28, y: 11, size: 2, tone: "amber", flow: "wide" },
  { x: 37, y: 7, size: 3, tone: "gold", flow: "wide" },
  { x: 47, y: 8, size: 2, tone: "cream", flow: "wide" },
  { x: 56, y: 12, size: 4, tone: "white", flow: "wide" },
  { x: 65, y: 18, size: 2, tone: "gold", flow: "wide" },
  { x: 80, y: 22, size: 3, tone: "cream", flow: "side" },
  { x: 89, y: 30, size: 2, tone: "amber", flow: "side" },
  { x: 94, y: 45, size: 4, tone: "white", flow: "side" },
  { x: 92, y: 60, size: 2, tone: "gold", flow: "side" },
  { x: 86, y: 70, size: 3, tone: "cream", flow: "side" },
  { x: 76, y: 81, size: 2, tone: "amber", flow: "side" },
  { x: 15, y: 82, size: 2, tone: "white", flow: "low" },
  { x: 25, y: 91, size: 4, tone: "gold", flow: "low" },
  { x: 40, y: 96, size: 2, tone: "cream", flow: "low" },
  { x: 56, y: 96, size: 3, tone: "white", flow: "low" },
  { x: 70, y: 91, size: 2, tone: "amber", flow: "low" },
  { x: 8, y: 55, size: 2, tone: "cream", flow: "loose" },
  { x: 21, y: 11, size: 2, tone: "gold", flow: "loose" },
  { x: 69, y: 14, size: 3, tone: "white", flow: "loose" },
  { x: 90, y: 57, size: 2, tone: "amber", flow: "loose" },
  { x: 73, y: 83, size: 3, tone: "gold", flow: "loose" },
];

export default function OrganicMagicDust() {
  return (
    <div aria-hidden="true" className={styles.dust}>
      <svg viewBox="0 0 700 700" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="wide-dust" x1="80" y1="280" x2="530" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f6d77a" stopOpacity="0" />
            <stop offset="0.32" stopColor="#fff1bd" stopOpacity="0.75" />
            <stop offset="0.68" stopColor="#fffaf0" stopOpacity="0.58" />
            <stop offset="1" stopColor="#eebc55" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="side-dust" x1="570" y1="140" x2="350" y2="550" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffaf0" stopOpacity="0" />
            <stop offset="0.45" stopColor="#f6d77a" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff1bd" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="low-dust" x1="120" y1="520" x2="520" y2="555" gradientUnits="userSpaceOnUse">
            <stop stopColor="#eebc55" stopOpacity="0" />
            <stop offset="0.52" stopColor="#fff1bd" stopOpacity="0.62" />
            <stop offset="1" stopColor="#fffaf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className={`${styles.guide} ${styles.wideGuide}`} d="M84 304C101 142 248 34 438 72c54 11 92 43 116 84" />
        <path className={`${styles.guide} ${styles.sideGuide}`} d="M574 150c104 91 73 252-64 327-45 25-81 56-111 89" />
        <path className={`${styles.guide} ${styles.lowGuide}`} d="M106 558c116 105 327 117 468 13" />
      </svg>

      {particles.map((particle, index) => (
        <span
          key={`${particle.flow}-${index}`}
          className={`${styles.particle} ${motionClass[particle.flow]} ${toneClass[particle.tone]}`}
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size * 3.35,
            height: particle.size * 3.35,
          }}
        />
      ))}
    </div>
  );
}
