import React, { useEffect, useState } from "react";

interface IconTokenProps {
  src?: string;
  title: string;
  fallback: string;
  className?: string;
}

export default function IconToken({ src, title, fallback, className }: IconTokenProps): JSX.Element {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (src && !errored) {
    return (
      <img
        className={`icon-token ${className ?? ""}`.trim()}
        src={src}
        alt=""
        title={title}
        loading="lazy"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <span className={`icon-token icon-fallback ${className ?? ""}`.trim()} title={title}>
      {fallback}
    </span>
  );
}
