"use client";

import { ReactNode, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  x?: number;
  scale?: number;
  opacity?: number;
  rotate?: number;
  stagger?: number;
  ease?: string;
  triggerStart?: string;
  once?: boolean;
};

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  duration = 0.8,
  y = 60,
  x = 0,
  scale = 1,
  opacity = 0,
  rotate = 0,
  ease = "power3.out",
  triggerStart = "top 85%",
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    gsap.set(element, {
      y,
      x,
      opacity,
      scale,
      rotate,
    });

    const animation = gsap.to(element, {
      y: 0,
      x: 0,
      opacity: 1,
      scale: 1,
      rotate: 0,
      duration,
      delay,
      ease,
      scrollTrigger: {
        trigger: element,
        start: triggerStart,
        toggleActions: once
          ? "play none none none"
          : "play reverse play reverse",
      },
    });

    return () => {
      animation.kill();
      ScrollTrigger.getAll().forEach((trigger) => {
        if (trigger.vars.trigger === element) {
          trigger.kill();
        }
      });
    };
  }, [delay, duration, y, x, scale, opacity, rotate, ease, triggerStart, once]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

type StaggerRevealProps = {
  children: ReactNode;
  className?: string;
  childClassName?: string;
  stagger?: number;
  delay?: number;
  duration?: number;
  y?: number;
  ease?: string;
  triggerStart?: string;
};

export function StaggerReveal({
  children,
  className = "",
  stagger = 0.1,
  delay = 0,
  duration = 0.6,
  y = 40,
  ease = "power3.out",
  triggerStart = "top 85%",
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const items = element.children;
    if (!items.length) return;

    gsap.set(items, {
      y,
      opacity: 0,
    });

    const animation = gsap.to(items, {
      y: 0,
      opacity: 1,
      duration,
      delay,
      stagger,
      ease,
      scrollTrigger: {
        trigger: element,
        start: triggerStart,
        toggleActions: "play none none none",
      },
    });

    return () => {
      animation.kill();
      ScrollTrigger.getAll().forEach((trigger) => {
        if (trigger.vars.trigger === element) {
          trigger.kill();
        }
      });
    };
  }, [stagger, delay, duration, y, ease, triggerStart]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

type TextRevealProps = {
  children: string;
  className?: string;
  delay?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  triggerStart?: string;
  type?: "chars" | "words" | "lines";
};

export function TextReveal({
  children,
  className = "",
  delay = 0,
  duration = 0.6,
  stagger = 0.02,
  ease = "power3.out",
  triggerStart = "top 85%",
  type = "words",
}: TextRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const text = children;
    let parts: string[] = [];

    if (type === "chars") {
      parts = text.split("");
    } else if (type === "words") {
      parts = text.split(" ");
    } else {
      parts = text.split("\n");
    }

    element.innerHTML = parts
      .map(
        (part, i) =>
          `<span class="inline-block overflow-hidden"><span class="reveal-text inline-block">${part}${type === "words" && i < parts.length - 1 ? "&nbsp;" : ""}</span></span>`,
      )
      .join("");

    const spans = element.querySelectorAll(".reveal-text");

    gsap.set(spans, {
      y: "100%",
      opacity: 0,
    });

    const animation = gsap.to(spans, {
      y: "0%",
      opacity: 1,
      duration,
      delay,
      stagger,
      ease,
      scrollTrigger: {
        trigger: element,
        start: triggerStart,
        toggleActions: "play none none none",
      },
    });

    return () => {
      animation.kill();
      ScrollTrigger.getAll().forEach((trigger) => {
        if (trigger.vars.trigger === element) {
          trigger.kill();
        }
      });
    };
  }, [children, delay, duration, stagger, ease, triggerStart, type]);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}
