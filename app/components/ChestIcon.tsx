export default function ChestIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-[58%] w-[58%] drop-shadow-sm">
      <defs>
        <linearGradient id="chest-lid" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f7d66b" />
          <stop offset="1" stopColor="#ad681d" />
        </linearGradient>
        <linearGradient id="chest-body" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#db9633" />
          <stop offset="1" stopColor="#6d3817" />
        </linearGradient>
      </defs>
      <path d="M8 27c0-12 9-19 24-19s24 7 24 19v5H8v-5Z" fill="url(#chest-lid)" stroke="#fff3b2" strokeWidth="3" />
      <path d="M8 30h48v21a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V30Z" fill="url(#chest-body)" stroke="#fff3b2" strokeWidth="3" />
      <path d="M14 30v26M50 30v26" stroke="#6e421c" strokeWidth="4" />
      <path d="M27 31h10v13H27z" fill="#fff4a7" stroke="#87531d" strokeWidth="3" />
      <path d="M30 37h4" stroke="#87531d" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
