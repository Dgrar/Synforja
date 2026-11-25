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
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-vermilion-500">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-serif text-4xl font-normal tracking-tight text-ink-950">
        {title}
        <span aria-hidden="true" className="text-vermilion-500">
          .
        </span>
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink-600">{description}</p>
    </div>
  );
}
