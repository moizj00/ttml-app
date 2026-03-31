import { motion, useScroll, useTransform } from "framer-motion";

export default function MinimalConcierge() {

  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, 50]);

  const slowReveal = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 1.8, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  const subtleFade = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 2, ease: "linear" as const },
    },
  };

  // Deep, muted navy: #0F172A (slate-900) but slightly adjusted for a richer navy
  const navy = "#0B132B";
  const mutedNavy = "rgba(11, 19, 43, 0.6)";
  const lightNavy = "rgba(11, 19, 43, 0.1)";

  return (
    <div
      className="min-h-screen w-full bg-[#FCFBF9] overflow-x-hidden flex flex-col"
      style={{
        fontFamily: "'Playfair Display', serif",
        color: navy,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      {/* Top Bar - Ultra Minimal */}
      <motion.header
        initial="hidden"
        animate="visible"
        variants={subtleFade}
        className="w-full px-8 md:px-20 py-12 flex justify-between items-center fixed top-0 left-0 bg-[#FCFBF9]/80 backdrop-blur-md z-50 transition-all"
      >
        <a href="/" className="flex items-center gap-3">
          <img src="/__mockup/images/logo-icon-badge.png" alt="Talk to My Lawyer" className="h-7 w-7 object-contain" />
          <span className="text-[10px] tracking-[0.3em] uppercase font-['Inter'] font-light">Talk to My Lawyer</span>
        </a>
        <button className="text-[10px] tracking-[0.2em] uppercase font-['Inter'] font-light hover:opacity-50 transition-opacity duration-500">
          Client Access
        </button>
      </motion.header>

      {/* Section 1: Hero */}
      <section className="h-screen flex flex-col justify-center px-8 md:px-20 max-w-7xl mx-auto w-full relative">
        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.5, delayChildren: 0.3 } },
          }}
          className="max-w-5xl"
        >
          <motion.h1
            variants={slowReveal}
            className="text-5xl md:text-7xl lg:text-[7.5rem] leading-[1.05] font-normal tracking-tight mb-16"
          >
            Resolution, <br />
            <span className="italic font-light text-opacity-80">quietly achieved.</span>
          </motion.h1>

          <motion.div variants={slowReveal} className="flex flex-col md:flex-row gap-12 md:gap-24 items-start md:items-center">
            <p className="text-xl md:text-2xl font-light leading-relaxed max-w-lg" style={{ color: mutedNavy }}>
              We draft, review, and deliver formal legal correspondence for those who understand that true leverage does not shout.
            </p>
            <div className="flex items-center pt-4 md:pt-0">
              <button className="group relative inline-flex items-center gap-6 text-[11px] tracking-[0.25em] uppercase font-['Inter'] font-light">
                <span className="relative z-10">Retain Our Services</span>
                <span className="block w-16 h-[1px] bg-current opacity-30 transition-all duration-700 group-hover:w-24 group-hover:opacity-100"></span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Section 2: The Philosophy */}
      <section className="py-40 px-8 md:px-20 relative">
        <div className="absolute inset-0 bg-[#F4F3F0] -skew-y-1 transform origin-top-left -z-10"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={slowReveal}
          >
            <h2 className="text-3xl md:text-5xl font-normal leading-[1.3] mb-12">
              "The most potent legal strategy is often <br className="hidden md:block"/> <span className="italic">the one that remains invisible.</span>"
            </h2>
            <p className="text-lg font-light font-['Inter'] max-w-2xl mx-auto leading-loose" style={{ color: mutedNavy }}>
              We operate on a simple premise: overwhelming force is rarely required when absolute precision is applied. Our correspondence is designed to clarify boundaries, establish undeniable facts, and compel resolution without fanfare.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Section 3: Restrained Features */}
      <section className="py-40 px-8 md:px-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={{
              visible: { transition: { staggerChildren: 0.4 } },
            }}
            className="flex flex-col gap-32"
          >
            <motion.div variants={slowReveal} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-t pt-12" style={{ borderColor: lightNavy }}>
              <div className="flex gap-12 md:w-1/2 items-baseline">
                <span className="text-[10px] tracking-[0.3em] uppercase font-['Inter']" style={{ color: mutedNavy }}>01</span>
                <h3 className="text-3xl md:text-4xl font-normal">Licensed Authority</h3>
              </div>
              <p className="text-lg font-light font-['Inter'] leading-relaxed md:w-1/2" style={{ color: mutedNavy }}>
                Every demand, notice, and formal letter is drafted, scrutinized, and approved by attorneys exclusively licensed in California.
              </p>
            </motion.div>

            <motion.div variants={slowReveal} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-t pt-12" style={{ borderColor: lightNavy }}>
              <div className="flex gap-12 md:w-1/2 items-baseline">
                <span className="text-[10px] tracking-[0.3em] uppercase font-['Inter']" style={{ color: mutedNavy }}>02</span>
                <h3 className="text-3xl md:text-4xl font-normal">Meticulous Craft</h3>
              </div>
              <p className="text-lg font-light font-['Inter'] leading-relaxed md:w-1/2" style={{ color: mutedNavy }}>
                Words are instruments of precision. We edit by subtraction, ensuring your position is stated with absolute clarity and consequence.
              </p>
            </motion.div>

            <motion.div variants={slowReveal} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-t pt-12" style={{ borderColor: lightNavy }}>
              <div className="flex gap-12 md:w-1/2 items-baseline">
                <span className="text-[10px] tracking-[0.3em] uppercase font-['Inter']" style={{ color: mutedNavy }}>03</span>
                <h3 className="text-3xl md:text-4xl font-normal">Unseen Shield</h3>
              </div>
              <p className="text-lg font-light font-['Inter'] leading-relaxed md:w-1/2" style={{ color: mutedNavy }}>
                A well-crafted letter from a firm of our standing often precludes the necessity—and expense—of protracted litigation entirely.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section 4: Understated Pricing & Final CTA */}
      <section className="py-40 px-8 md:px-20 flex flex-col items-center justify-center text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            visible: { transition: { staggerChildren: 0.4 } },
          }}
          className="max-w-3xl"
        >
          <motion.h2 variants={slowReveal} className="text-4xl md:text-6xl font-normal mb-16">
            Engage our counsel.
          </motion.h2>

          <motion.div variants={slowReveal} className="mb-24 space-y-6">
            <p className="text-xl md:text-2xl font-light italic" style={{ color: mutedNavy }}>
              Attorney-drafted correspondence commences at{" "}
              <span className="font-['Inter'] not-italic font-normal tracking-wide" style={{ color: navy }}>$200</span>.
            </p>
            <p className="text-[11px] font-['Inter'] font-light tracking-[0.2em] uppercase" style={{ color: mutedNavy }}>
              Transparent terms. Complete confidentiality.
            </p>
          </motion.div>

          <motion.button 
            variants={slowReveal}
            className="group relative inline-flex items-center justify-center gap-4 text-[11px] tracking-[0.25em] uppercase font-['Inter'] font-light text-[#FCFBF9] px-12 py-6 transition-colors duration-700"
            style={{ backgroundColor: navy }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(11, 19, 43, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = navy}
          >
            Begin Consultation
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="w-full px-8 md:px-20 py-16 flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] tracking-[0.2em] uppercase font-['Inter'] font-light border-t" style={{ borderColor: lightNavy, color: mutedNavy }}>
        <a href="/" className="flex items-center gap-2">
          <img src="/__mockup/images/logo-icon-badge.png" alt="Talk to My Lawyer" className="h-5 w-5 object-contain" />
          <span>Talk to My Lawyer &copy; {new Date().getFullYear()}</span>
        </a>
        <div className="flex gap-12">
          <a href="#" className="hover:opacity-50 transition-opacity duration-500">Privity</a>
          <a href="#" className="hover:opacity-50 transition-opacity duration-500">Terms</a>
        </div>
        <div>California, US</div>
      </footer>
    </div>
  );
}
