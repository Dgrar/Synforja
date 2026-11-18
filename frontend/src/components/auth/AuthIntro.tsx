export function AuthIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.22em] text-mint-400">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-mist-50">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-mist-400">{description}</p>
    </div>
  );
}
