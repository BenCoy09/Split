type LogoProps = {
  size?: number;
};

export default function Logo({ size = 26 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="logo"
    >
      <polygon points="2,2 30,2 2,30" fill="#2DD4BF" />
      <polygon points="30,2 30,30 2,30" fill="#F59E0B" />
    </svg>
  );
}
