"use client";

import { useEffect, useState } from "react";

const homeQuestions = [
  "A reading list?",
  "A project reference?",
  "A little corner of the web worth sharing?",
];
const aboutQuestions = [
  "Found a good read?",
  "Built a useful collection?",
  "Know someone who would enjoy it?",
];
const characterDelay = 65;
const holdDelay = 3200;

// Types each question, holds it, then moves on; loops quietly. Screen readers
// get the full set once, and reduced-motion/no-JS readers get static text.
export function LandingQuestions({ about = false }: { about?: boolean }) {
  const questions = about ? aboutQuestions : homeQuestions;
  const [frame, setFrame] = useState({ question: 0, characters: 0 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const finished = frame.characters === questions[frame.question].length;
    const timer = window.setTimeout(
      () =>
        setFrame((current) =>
          finished
            ? { question: (current.question + 1) % questions.length, characters: 0 }
            : { ...current, characters: current.characters + 1 },
        ),
      finished ? holdDelay : characterDelay,
    );
    return () => window.clearTimeout(timer);
  }, [frame, reduced, questions]);

  return (
    <div className="landing-questions">
      <p className="sr-only">{questions.join(" ")}</p>
      <div className="question-animation">
        <p className="landing-lead typed-question" aria-hidden="true">
          <span className="question-space">{questions[2]}</span>
          <span className="question-text">
            {questions[frame.question].slice(0, frame.characters)}
            <span className="typing-caret">|</span>
          </span>
        </p>
      </div>
      <p className="landing-lead question-static" aria-hidden="true">
        {questions.map((question) => (
          <span key={question}>{question}</span>
        ))}
      </p>
    </div>
  );
}
