"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ImportFileInput() {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [filename, setFilename] = useState("");
  const [missing, setMissing] = useState(false);
  const [format, setFormat] = useState("bookmarks");
  useEffect(() => {
    setFilename(input.current?.files?.[0]?.name ?? "");
    setEnhanced(true);
  }, []);
  return (
    <div className="import-file-fields">
      <div className="import-format">
        <label htmlFor={`${id}-format`}>File format</label>
        <select
          id={`${id}-format`}
          name="sourceKind"
          aria-describedby={`${id}-hint`}
          defaultValue="bookmarks"
          onChange={(event) => setFormat(event.currentTarget.value)}
        >
          <option value="bookmarks">Browser bookmarks (HTML)</option>
          <option value="csv">Structured import (CSV)</option>
          <option value="text">Text file (TXT)</option>
        </select>
      </div>
      <div className="import-upload">
        <label htmlFor={id} className="sr-only">
          Bookmarks, CSV or text file
        </label>
        <input
          ref={input}
          id={id}
          type="file"
          name="file"
          accept=".html,.htm,.csv,.txt"
          required
          hidden={enhanced}
          onChange={(event) => {
            setFilename(event.currentTarget.files?.[0]?.name ?? "");
            setMissing(false);
          }}
          onInvalid={(event) => {
            if (!enhanced) return;
            event.preventDefault();
            setMissing(true);
            button.current?.focus();
          }}
        />
        {enhanced && (
          <>
            <button
              ref={button}
              className="button"
              type="button"
              onClick={() => input.current?.click()}
              aria-describedby={missing ? `${id}-error` : undefined}
            >
              Upload file
            </button>
            <span className="meta import-filename" role="status">
              {filename || "No file selected"}
            </span>
          </>
        )}
      </div>
      <p className="meta import-file-hint" id={`${id}-hint`}>
        {enhanced
          ? format === "bookmarks"
            ? "Use the HTML file exported by your browser."
            : format === "csv"
              ? "Use the collection,section,url,tags CSV format."
              : "Use a .txt file with one URL per line."
          : "Choose the format that matches your file."}{" "}
        Up to 5,000 links and 10 MB.
      </p>
      {missing && (
        <p className="import-reason" id={`${id}-error`} role="alert">
          Select a file to review.
        </p>
      )}
    </div>
  );
}
