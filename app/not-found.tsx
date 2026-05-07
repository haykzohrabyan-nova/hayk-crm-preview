"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function NotFound() {
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    setTimestamp(new Date().toISOString().replace("T", " ").slice(0, 19));
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap');

        .nf-body {
          background: #0f0e0d;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Space Mono', monospace;
        }

        .nf-wrapper {
          min-height: 520px;
          background: #0f0e0d;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 2rem;
          position: relative;
          overflow: hidden;
        }

        .nf-bg-lines {
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            0deg,
            transparent, transparent 28px,
            rgba(255,255,255,0.03) 28px,
            rgba(255,255,255,0.03) 29px
          );
          pointer-events: none;
        }

        .nf-print-head {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 6px;
          background: #1a1917;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .nf-beam {
          height: 4px;
          width: 60px;
          /* gold in light mode, orange in dark — matches --color-accent */
          background: linear-gradient(90deg, transparent, #E8C97A, transparent);
          animation: nf-scan 2.8s ease-in-out infinite;
          border-radius: 2px;
        }

        @keyframes nf-scan {
          0%   { transform: translateX(-340px); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(340px); opacity: 0; }
        }

        .nf-paper {
          background: #faf8f2;
          border: 1px solid #d8d0bc;
          border-radius: 4px 4px 0 0;
          width: 260px;
          padding: 2rem 1.8rem 1.6rem;
          text-align: center;
          position: relative;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          animation: nf-paperPull 0.9s cubic-bezier(.16,1,.3,1) forwards;
        }

        @keyframes nf-paperPull {
          from { transform: translateY(-60px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }

        .nf-paper::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: repeating-linear-gradient(
            90deg,
            #d4ccb6 0px, #d4ccb6 4px,
            transparent 4px, transparent 8px
          );
        }

        .nf-code {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 96px;
          line-height: 1;
          color: #1B2B4B;
          letter-spacing: 4px;
          margin: 0 0 4px;
        }

        /* the "0" uses our gold accent */
        .nf-code span { color: #E8C97A; }

        .nf-lines {
          margin: 12px 0 16px;
          text-align: left;
        }

        .nf-pline {
          font-size: 9px;
          color: #7a7060;
          line-height: 1.9;
          border-bottom: 1px dashed #e0d8c8;
          padding-bottom: 2px;
          margin-bottom: 2px;
          font-family: 'Space Mono', monospace;
        }

        .nf-pline.danger { color: #DC2626; font-weight: 700; }
        .nf-pline.bold   { color: #1B2B4B; font-weight: 700; }

        /* stamp uses navy + gold to match brand */
        .nf-stamp {
          display: inline-block;
          border: 2px solid #1B2B4B;
          color: #1B2B4B;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px;
          letter-spacing: 3px;
          padding: 4px 12px;
          transform: rotate(-4deg);
          margin: 8px 0 14px;
          position: relative;
        }

        /* gold underline on stamp */
        .nf-stamp::after {
          content: '';
          position: absolute;
          bottom: 3px; left: 8px; right: 8px;
          height: 2px;
          background: #E8C97A;
        }

        .nf-note {
          font-size: 8px;
          color: #a09880;
          font-family: 'Space Mono', monospace;
          text-align: left;
        }

        .nf-paper-tail {
          width: 260px;
          height: 20px;
          background: #faf8f2;
          border: 1px solid #d8d0bc;
          border-top: none;
          border-radius: 0 0 2px 2px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 3px;
        }

        .nf-tear {
          width: 250px;
          height: 6px;
          background: repeating-linear-gradient(
            90deg,
            #faf8f2 0px, #faf8f2 5px,
            transparent 5px, transparent 7px
          );
        }

        .nf-corner {
          position: absolute;
          top: 14px; right: 18px;
          font-size: 9px;
          color: #E8C97A;
          letter-spacing: 2px;
          text-transform: uppercase;
          font-family: 'Space Mono', monospace;
        }

        .nf-ink-dots {
          position: absolute;
          bottom: 16px; left: 18px;
          display: flex;
          gap: 5px;
        }

        .nf-dot { width: 6px; height: 6px; border-radius: 50%; }

        .nf-actions {
          margin-top: 24px;
          display: flex;
          gap: 10px;
          justify-content: center;
        }

        .nf-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          background: #E8C97A;
          color: #1B2B4B;
          text-decoration: none;
          font-family: 'Space Mono', monospace;
          transition: opacity 0.15s;
        }

        .nf-btn-primary:hover { opacity: 0.85; }
      `}</style>

      <div className="nf-body">
        <div className="nf-wrapper">
          <div className="nf-bg-lines" />
          <div className="nf-print-head">
            <div className="nf-beam" />
          </div>

          <span className="nf-corner">BAZAARPRINTING</span>

          <div className="nf-ink-dots">
            <div className="nf-dot" style={{ background: "#00b5c8" }} />
            <div className="nf-dot" style={{ background: "#e83e8c" }} />
            <div className="nf-dot" style={{ background: "#f5c518" }} />
            <div className="nf-dot" style={{ background: "#555" }} />
          </div>

          <div className="nf-paper">
            <div className="nf-code">
              4<span>0</span>4
            </div>

            <div className="nf-lines">
              <div className="nf-pline bold">JOB: PAGE_NOT_FOUND</div>
              <div className="nf-pline">QUEUE ID: #ERR-0xDEAD-404</div>
              <div className="nf-pline">
                TIMESTAMP: {timestamp || "—"}
              </div>
              <div className="nf-pline danger">STATUS: PRINT FAILED ✗</div>
              <div className="nf-pline">
                TRAY: — &nbsp; COPIES: 0 &nbsp; PAGES: 0
              </div>
              <div className="nf-pline">REASON: RESOURCE UNAVAILABLE</div>
            </div>

            <div className="nf-stamp">PAGE MISSING</div>

            <div className="nf-note">
              The document you requested
              <br />
              could not be located in the system.
            </div>
          </div>

          <div className="nf-paper-tail">
            <div className="nf-tear" />
          </div>

          <div className="nf-actions">
            <Link href="/" className="nf-btn-primary">
              ↩ Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
