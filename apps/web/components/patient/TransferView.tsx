"use client";

import { useState, useEffect, useRef } from "react";
import { Shield, Copy, CheckCircle, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./TransferView.module.css";

export function TransferView() {
  const [generated, setGenerated] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doctorLabel = "your current doctor";

  // Start 10-minute countdown when a code is generated
  useEffect(() => {
    if (!generated) return;
    setSecondsLeft(600);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          // Code expired — reset to generate screen
          setGenerated(false);
          setCode("");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [generated]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please log in again.");

      const res = await fetch("/api/transfer/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json() as { code?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? "Failed to generate code.");
      setCode(data.code!);
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate code.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGenerated(false);
    setConfirmed(false);
    setCode("");
    setError("");
  };

  if (confirmed) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successIcon}><CheckCircle size={40} strokeWidth={1.5} /></div>
        <h2 className={styles.successTitle}>Transfer Initiated · ट्रांसफर शुरू हुआ</h2>
        <p className={styles.successSub}>
          Share code · कोड साझा करें <strong>{code}</strong> with your new doctor.{" "}
          {secondsLeft > 0 && `It expires in ${formatTime(secondsLeft)}. यह ${formatTime(secondsLeft)} में समाप्त होगा।`}
        </p>
        <button type="button" className={styles.btnPrimary} onClick={handleReset}>
          Generate New Code · नया कोड बनाएं
        </button>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <h1 className={styles.title}>Transfer Doctor · डॉक्टर बदलें</h1>
        <p className={styles.sub}>Generate a secure code to transfer your records to a new doctor · नए डॉक्टर को रिकॉर्ड देने के लिए सुरक्षित कोड बनाएं</p>
      </div>

      <div className={styles.body}>
        {/* Current doctor info */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Current Doctor · वर्तमान डॉक्टर</p>
          <div className={styles.doctorRow}>
            <div className={styles.doctorAvatar}>DR</div>
            <div>
              <p className={styles.doctorName}>{doctorLabel}</p>
              <p className={styles.doctorHospital}>AIIMS, New Delhi</p>
            </div>
          </div>
          <div className={styles.warningBox}>
            <AlertTriangle size={14} className={styles.warnIcon} />
            <p className={styles.warnText}>
              Once your new doctor imports your records,{" "}
              <strong>{doctorLabel}</strong> will immediately lose access to your health data. · नया डॉक्टर रिकॉर्ड इंपोर्ट करने के बाद पुराने डॉक्टर की पहुंच बंद हो जाएगी।
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>How Transfer Works · ट्रांसफर कैसे होगा</p>
          <div className={styles.steps}>
            {[
              { n: "1", t: "Generate Code · कोड बनाएं", s: "Create a 6-digit transfer code · 6 अंकों का ट्रांसफर कोड बनाएं" },
              { n: "2", t: "Share with New Doctor · नए डॉक्टर से साझा करें", s: "Code expires in 10 minutes · कोड 10 मिनट में समाप्त होगा" },
              { n: "3", t: "Doctor Imports Records · डॉक्टर रिकॉर्ड इंपोर्ट करेगा", s: "New doctor enters the code in their dashboard · नया डॉक्टर डैशबोर्ड में कोड डालेगा" },
              { n: "4", t: "Transfer Complete · ट्रांसफर पूरा", s: "Health history moves securely · स्वास्थ्य रिकॉर्ड सुरक्षित रूप से जुड़ेंगे" },
            ].map((step) => (
              <div key={step.n} className={styles.step}>
                <div className={styles.stepNum}>{step.n}</div>
                <div>
                  <p className={styles.stepTitle}>{step.t}</p>
                  <p className={styles.stepSub}>{step.s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Generate / display code */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Generate Transfer Code · ट्रांसफर कोड बनाएं</p>

          {!generated ? (
            <div className={styles.generateWrap}>
              <div className={styles.infoBox}>
                <Shield size={15} className={styles.infoIcon} />
                <p className={styles.infoText}>
                  Your code will be valid for 10 minutes and can only be used once. · कोड 10 मिनट तक वैध रहेगा और केवल एक बार उपयोग होगा।
                </p>
              </div>
              {error && (
                <p style={{ color: "#e24b4a", fontSize: 13, marginBottom: 8 }}>
                  {error}
                </p>
              )}
              <button
                type="button"
                className={styles.btnGenerate}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Generating… · बन रहा है..." : "Generate 6-Digit Code · 6 अंकों का कोड बनाएं"}
              </button>
            </div>
          ) : (
            <div className={styles.codeWrap}>
              <div className={styles.codeDisplay}>
                {code.split("").map((d, i) => (
                  <div key={i} className={styles.codeDigit}>{d}</div>
                ))}
              </div>
              <div className={styles.codeActions}>
                <button type="button" className={styles.btnCopy} onClick={handleCopy}>
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  {copied ? "Copied! · कॉपी हुआ" : "Copy Code · कोड कॉपी करें"}
                </button>
                <p className={styles.codeExpiry}>
                  Expires in {formatTime(secondsLeft)} · {formatTime(secondsLeft)} में समाप्त
                </p>
              </div>
              <div className={styles.confirmBox}>
                <p className={styles.confirmText}>
                  By confirming, you acknowledge that{" "}
                  <strong>{doctorLabel}</strong> will lose access to your records. · पुष्टि करने पर पुराने डॉक्टर की पहुंच बंद हो जाएगी।
                </p>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.btnGhost} onClick={handleReset}>
                    Cancel · रद्द करें
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => setConfirmed(true)}
                  >
                    Confirm Transfer · ट्रांसफर पुष्टि करें
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
