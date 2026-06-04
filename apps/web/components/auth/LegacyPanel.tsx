"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./LegacyPanel.module.css";

const ROTATION_INTERVAL_MS = 45_000;
const FADE_DURATION_MS = 320;

const figures = [
  {
    name: "William Osler",
    context: "Father of modern clinical medicine | 1849-1919",
    quote:
      "The good physician treats the disease; the great physician treats the patient who has the disease.",
    image: "/images/legacy/william-osler.png",
  },
  {
    name: "Hippocrates",
    context: "Father of Medicine | 460-370 BC",
    quote:
      "Wherever the art of medicine is loved, there is also a love of humanity.",
    image: "/images/legacy/hippocrates.png",
  },
  {
    name: "Archie Cochrane",
    context: "Pioneer of evidence-based medicine | 1909-1988",
    quote: "In God we trust, all others must bring data.",
    image: "/images/legacy/archie-cochrane.png",
  },
  {
    name: "Rene Laennec",
    context: "Inventor of the stethoscope | 1781-1826",
    quote: "Listen to the patient; the diagnosis often begins there.",
    image: "/images/legacy/rene-laennec.png",
  },
] as const;

export function LegacyPanel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [rotationVersion, setRotationVersion] = useState(0);
  const fadeTimeoutRef = useRef<number | null>(null);

  const transitionToFigure = useCallback(
    (getNextIndex: (currentIndex: number) => number) => {
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }

      setIsVisible(false);
      fadeTimeoutRef.current = window.setTimeout(() => {
        setActiveIndex((currentIndex) => getNextIndex(currentIndex));
        setIsVisible(true);
        fadeTimeoutRef.current = null;
      }, FADE_DURATION_MS);
    },
    [],
  );

  useEffect(() => {
    const rotationTimer = window.setInterval(() => {
      transitionToFigure(
        (currentIndex) => (currentIndex + 1) % figures.length,
      );
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(rotationTimer);
  }, [rotationVersion, transitionToFigure]);

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  const activeFigure = figures[activeIndex] ?? figures[0];

  const handleSelect = (index: number) => {
    if (index === activeIndex) {
      return;
    }

    setRotationVersion((current) => current + 1);
    transitionToFigure(() => index);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.ambientGlowSecondary} aria-hidden="true" />

      <div
        className={`${styles.stage} ${isVisible ? styles.visible : styles.hidden}`}
      >
        <div className={styles.figureFrame}>
          <Image
            key={activeFigure.name}
            src={activeFigure.image}
            alt={`Portrait of ${activeFigure.name}`}
            fill
            priority
            sizes="(max-width: 980px) 0px, (max-width: 1440px) 28vw, 360px"
            className={styles.figureImage}
          />
        </div>

        <blockquote className={styles.quote}>
          &ldquo;{activeFigure.quote}&rdquo;
        </blockquote>

        <div className={styles.separator} aria-hidden="true" />

        <p className={styles.name}>{activeFigure.name}</p>
        <p className={styles.context}>{activeFigure.context}</p>
      </div>

      <div
        className={styles.pagination}
        role="tablist"
        aria-label="Medical legacy quotes"
      >
        {figures.map((figure, index) => (
          <button
            key={figure.name}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={`Show quote by ${figure.name}`}
            className={`${styles.dot} ${
              index === activeIndex ? styles.dotActive : ""
            }`}
            onClick={() => handleSelect(index)}
          />
        ))}
      </div>
    </div>
  );
}
