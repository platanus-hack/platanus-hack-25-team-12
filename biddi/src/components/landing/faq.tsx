"use client";

import { useState } from "react";
import { ScrollReveal, StaggerReveal } from "@/components/ui/scroll-reveal";

const faqs = [
  {
    question: "¿Cómo me protege BodyCart?",
    answer:
      "BodyCart utiliza modelos avanzados de IA entrenados con miles de patrones de estafas conocidas, intentos de phishing y sitios web fraudulentos. Analiza continuamente las páginas que visitas en tiempo real, buscando elementos sospechosos como formularios de pago falsos, precios engañosos, señales de alerta de vendedores en marketplaces y dominios maliciosos conocidos. Cuando se detecta una amenaza, recibes una notificación instantánea con detalles sobre el riesgo.",
  },
  {
    question: "¿Están seguros mis datos con BodyCart?",
    answer:
      "Absolutamente. BodyCart está diseñado con la privacidad como prioridad principal. Todo el análisis ocurre localmente en tu navegador - tus datos de navegación nunca salen de tu dispositivo. No recopilamos, almacenamos ni transmitimos ninguna información personal, historial de navegación o contenido de las páginas que visitas. La extensión solo necesita permisos mínimos para funcionar.",
  },
  {
    question: "¿Qué tipos de estafas puede detectar BodyCart?",
    answer:
      "BodyCart puede identificar una amplia gama de amenazas en línea incluyendo: estafas en Facebook Marketplace (vendedores falsos, precios demasiado buenos para ser verdad, cuentas sospechosas), sitios web de phishing que intentan robar credenciales, sitios de comercio electrónico falsos, listados de productos falsificados, fraude en formularios de pago y dominios maliciosos conocidos. Nuestros modelos de IA se actualizan continuamente para detectar nuevos patrones de estafa.",
  },
  {
    question: "¿Cómo instalo la extensión?",
    answer:
      "Instalar BodyCart es simple: 1) Descarga el archivo ZIP desde esta página, 2) Extrae/descomprime el archivo en una carpeta de tu computador, 3) Abre Chrome y ve a chrome://extensions/, 4) Activa el 'Modo desarrollador' en la esquina superior derecha, 5) Haz clic en 'Cargar descomprimida' y selecciona la carpeta extraída. ¡Eso es todo! BodyCart ahora te protegerá mientras navegas.",
  },
  {
    question: "¿BodyCart es realmente gratis?",
    answer:
      "Sí, BodyCart es completamente gratis sin costos ocultos, niveles premium ni compras dentro de la aplicación. Creemos que todos merecen protección contra estafas en línea. La extensión se desarrolla como un proyecto de código abierto enfocado en hacer internet más seguro para todos.",
  },
  {
    question: "¿BodyCart ralentiza mi navegador?",
    answer:
      "No. BodyCart está optimizado para el rendimiento y funciona eficientemente en segundo plano. El análisis de IA es ligero y ocurre de forma asíncrona, por lo que no afectará la velocidad de navegación ni los tiempos de carga de páginas. La mayoría de los usuarios no notan ningún impacto en el rendimiento.",
  },
  {
    question: "¿Qué navegadores soporta BodyCart?",
    answer:
      "Actualmente, BodyCart está disponible como extensión de Chrome, que también funciona en navegadores basados en Chromium como Microsoft Edge, Brave, Opera y Vivaldi. Las versiones para Firefox y Safari se están considerando para futuras versiones según la demanda de los usuarios.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24 px-4 bg-neutral-950">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">
              Preguntas Frecuentes
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="text-xl text-white/60">
              Todo lo que necesitas saber sobre BodyCart
            </p>
          </ScrollReveal>
        </div>

        {/* FAQ accordion */}
        <StaggerReveal className="space-y-4" stagger={0.08}>
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors"
            >
              {/* Question button */}
              <button
                onClick={() => toggleFaq(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
              >
                <span className="text-lg font-medium text-white pr-4">
                  {faq.question}
                </span>
                <span
                  className={`shrink-0 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center transition-transform duration-300 ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </span>
              </button>

              {/* Answer */}
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? "max-h-96" : "max-h-0"
                }`}
              >
                <div className="px-6 pb-5 pt-0">
                  <p className="text-white/60 leading-relaxed">{faq.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </StaggerReveal>

        {/* More questions CTA */}
        <ScrollReveal delay={0.3}>
          <div className="mt-12 text-center">
            <p className="text-white/60 mb-4">¿Aún tienes preguntas?</p>
            <a
              href="mailto:support@bodycart.app"
              className="inline-flex items-center gap-2 text-white hover:text-white/80 transition-colors"
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
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Contáctanos
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
