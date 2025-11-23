"use client";

import { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import ColorBends from "@/components/ui/color-bends";

export function Hero() {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const elements = content.children;

    gsap.set(elements, {
      y: 40,
      opacity: 0,
    });

    gsap.to(elements, {
      y: 0,
      opacity: 1,
      duration: 0.8,
      stagger: 0.15,
      ease: "power3.out",
      delay: 0.3,
    });
  }, []);

  const handleDownload = () => {
    setShowInstructions(true);
  };

  const copyExtensionUrl = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions/");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = "chrome://extensions/";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Full-screen ColorBends background */}
      <ColorBends
        className="absolute! inset-0!"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          background: "#000",
        }}
        colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
        rotation={30}
        speed={0.3}
        scale={0.5}
        frequency={0.8}
        warpStrength={1.2}
        mouseInfluence={0.8}
        parallax={0.6}
        noise={0.08}
        transparent={false}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 text-center px-6 max-w-3xl mx-auto"
      >
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-6 font-heading">
          BodyCart
        </h1>

        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-6 font-heading">
          Tu guardaespaldas digital
        </h2>

        <p className="text-lg md:text-xl text-white/80 mb-12 max-w-xl mx-auto font-light">
          Protección con IA contra estafas y phishing mientras compras en línea.
        </p>

        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black font-medium rounded-full hover:bg-white/90 transition-all duration-200"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Descargar Extensión
        </button>

        <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-white/60">
          <span>Gratis</span>
          <span>Sin recolección de datos</span>
          <span>Potenciado por IA</span>
        </div>
      </div>

      {/* Installation Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl relative">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-black transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <h3 className="text-2xl font-semibold text-black mb-2">
              Instalar BodyCart
            </h3>
            <p className="text-neutral-500 mb-8">
              Sigue estos pasos para estar protegido
            </p>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <p className="text-black font-medium mb-2">
                    Descarga la extensión
                  </p>
                  <a
                    href="/extension.zip"
                    download="body-cart-extension.zip"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Descargar ZIP
                  </a>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center text-black text-sm font-medium shrink-0">
                  2
                </div>
                <div>
                  <p className="text-black font-medium">
                    Extrae el archivo ZIP
                  </p>
                  <p className="text-neutral-500 text-sm">
                    Descomprime en una carpeta de tu computador
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center text-black text-sm font-medium shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <p className="text-black font-medium mb-2">
                    Abre las Extensiones de Chrome
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-black bg-neutral-100 px-3 py-2 rounded-lg text-sm font-mono">
                      chrome://extensions/
                    </code>
                    <button
                      onClick={copyExtensionUrl}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        copied
                          ? "bg-black text-white"
                          : "bg-neutral-100 text-black hover:bg-neutral-200"
                      }`}
                    >
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center text-black text-sm font-medium shrink-0">
                  4
                </div>
                <div>
                  <p className="text-black font-medium">
                    Activa el Modo Desarrollador
                  </p>
                  <p className="text-neutral-500 text-sm">
                    Activa el interruptor en la esquina superior derecha
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center text-black text-sm font-medium shrink-0">
                  5
                </div>
                <div>
                  <p className="text-black font-medium">Cargar descomprimida</p>
                  <p className="text-neutral-500 text-sm">
                    Haz clic en &quot;Cargar descomprimida&quot; y selecciona la
                    carpeta extraída
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-200">
              <p className="text-center text-neutral-500 text-sm">
                ¡Listo! BodyCart ahora te está protegiendo.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
