"use client";

import { useEffect, useRef, useState } from "react";

// A photo from /public that fades in once loaded and stays hidden if the file
// is missing, so whatever sits behind it (a gradient/illustration) shows instead.
export default function SmartImage({ src, alt, className = "", eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // The image may finish (or fail) before hydration, so check its state once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async"
      onLoad={() => setLoaded(true)} onError={() => setLoaded(false)}
      className={`${className} transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`} />
  );
}
