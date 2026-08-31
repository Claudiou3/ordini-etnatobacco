"use client";

/**
 * Pulsante fisso con freccia su / freccia giu: scorre velocemente
 * in cima e in fondo alla pagina.
 */
export function ScrollNav() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight - window.innerHeight,
      behavior: "smooth",
    });
  };

  return (
    <div className="scroll-nav" role="navigation" aria-label="Scorri pagina">
      <button
        type="button"
        className="scroll-nav-btn"
        onClick={scrollToTop}
        aria-label="Vai in cima alla pagina"
        title="Vai in cima"
      >
        <span aria-hidden="true">▲</span>
      </button>
      <button
        type="button"
        className="scroll-nav-btn"
        onClick={scrollToBottom}
        aria-label="Vai in fondo alla pagina"
        title="Vai in fondo"
      >
        <span aria-hidden="true">▼</span>
      </button>
    </div>
  );
}
