import React, { useEffect, useRef, useState } from 'react';

const FISH_SRC = '/fish.svg';

const WaterAnimation = ({ active }) => {
  const [render, setRender] = useState(active);
  const fadeOutTimer = useRef(null);

  useEffect(() => {
    if (active) {
      if (fadeOutTimer.current) {
        clearTimeout(fadeOutTimer.current);
        fadeOutTimer.current = null;
      }
      setRender(true);
    } else if (render) {
      fadeOutTimer.current = setTimeout(() => setRender(false), 450);
    }
    return () => {
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current);
    };
  }, [active, render]);

  if (!render) return null;

  return (
    <div className={`water-animation${active ? ' is-active' : ' is-leaving'}`} aria-hidden="true">
      <div className="water-fill" />
      <svg className="water-wave water-wave-back" viewBox="0 0 1200 60" preserveAspectRatio="none">
        <path d="M 0 32 Q 150 8 300 32 T 600 32 T 900 32 T 1200 32 V 60 H 0 Z" />
      </svg>
      <svg className="water-wave water-wave-front" viewBox="0 0 1200 60" preserveAspectRatio="none">
        <path d="M 0 30 Q 150 52 300 30 T 600 30 T 900 30 T 1200 30 V 60 H 0 Z" />
      </svg>
      <img src={FISH_SRC} alt="" className="water-fish water-fish-1" />
      <img src={FISH_SRC} alt="" className="water-fish water-fish-2" />
      <img src={FISH_SRC} alt="" className="water-fish water-fish-3" />
    </div>
  );
};

export default WaterAnimation;
