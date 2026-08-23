import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (p: P) => {
  const { size = 16, ...rest } = p;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
};

export const IPlay = (p: P) => (
  <svg {...base(p)}><path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" /></svg>
);
export const IStop = (p: P) => (
  <svg {...base(p)}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" /></svg>
);
export const ICamera = (p: P) => (
  <svg {...base(p)}><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" /></svg>
);
export const IHistory = (p: P) => (
  <svg {...base(p)}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /><path d="M12 8v4l3 2" /></svg>
);
export const IGear = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></svg>
);
export const IChat = (p: P) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-8 8H4l1.7-3.2A8 8 0 1 1 21 12z" /></svg>
);
export const IFile = (p: P) => (
  <svg {...base(p)}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
);
export const IFolder = (p: P) => (
  <svg {...base(p)}><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>
);
export const ILock = (p: P) => (
  <svg {...base(p)}><rect x="6" y="10" width="12" height="9" rx="1.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg>
);
export const ICheck = (p: P) => (
  <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IX = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const ITrash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" /></svg>
);
export const IPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const ISpark = (p: P) => (
  <svg {...base(p)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" stroke="none" /><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" stroke="none" /></svg>
);
export const IDatabase = (p: P) => (
  <svg {...base(p)}><ellipse cx="12" cy="5.5" rx="7" ry="2.8" /><path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" /><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" /></svg>
);
export const ITerminal = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12.5 15H17" /></svg>
);
export const IEye = (p: P) => (
  <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
);
export const ISend = (p: P) => (
  <svg {...base(p)}><path d="M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-7-2.5z" /></svg>
);
export const IChevD = (p: P) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const IChevR = (p: P) => (
  <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>
);
export const INode = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /></svg>
);
export const IBrain = (p: P) => (
  <svg {...base(p)}><path d="M9.5 4A2.8 2.8 0 0 0 6 6.7c-1.8.5-2.8 2-2.5 3.8-1 .9-1 2.8.3 3.8.1 2.2 1.7 3.7 3.9 3.7h1.8V4zM14.5 4A2.8 2.8 0 0 1 18 6.7c1.8.5 2.8 2 2.5 3.8 1 .9 1 2.8-.3 3.8-.1 2.2-1.7 3.7-3.9 3.7h-1.8V4z" /><path d="M12 4v14" /></svg>
);
export const IBox = (p: P) => (
  <svg {...base(p)}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
);
export const IWarn = (p: P) => (
  <svg {...base(p)}><path d="M12 4L2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.1" /></svg>
);
export const IRestore = (p: P) => (
  <svg {...base(p)}><path d="M4 12a8 8 0 1 1 2.3 5.6" /><path d="M4 20v-4h4" /></svg>
);
export const IPulse = (p: P) => (
  <svg {...base(p)}><path d="M3 12h4l2.5-6 4 12L16 12h5" /></svg>
);
export const IDot = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" /></svg>
);
export const ILayers = (p: P) => (
  <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17l9 5 9-5" opacity=".45" /></svg>
);
export const IGrip = (p: P) => (
  <svg {...base(p)}>{[6, 12, 18].map((y) => <g key={y}><circle cx="9" cy={y} r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy={y} r="1.1" fill="currentColor" stroke="none" /></g>)}</svg>
);
