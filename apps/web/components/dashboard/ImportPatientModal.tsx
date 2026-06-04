"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Phone, Shield, UserPlus, X } from "lucide-react";
import { importPatientWithOTP, startPatientImportOTP, validatePatientId } from "@/lib/patient-transfer";
import type { PatientData } from "@/lib/patient-types";
import styles from "./ImportPatientModal.module.css";

type Step = "input" | "otp" | "importing" | "success" | "error";

interface ImportPatientModalProps {
  doctorId: string;
  onClose: () => void;
  onSuccess?: (patientData: PatientData) => void;
}

export function ImportPatientModal({ doctorId, onClose, onSuccess }: ImportPatientModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [patientPhone, setPatientPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [importedPatient, setImportedPatient] = useState<PatientData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ patientPhone?: string; otpCode?: string }>({});

  const reset = () => {
    setStep("input");
    setPatientPhone("");
    setOtpCode("");
    setError("");
    setImportedPatient(null);
    setFieldErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validatePhone = () => {
    const errs: typeof fieldErrors = {};
    if (!patientPhone.trim()) {
      errs.patientPhone = "Registered phone number is required";
    } else if (!validatePatientId(patientPhone.trim())) {
      errs.patientPhone = "Must be a 10-digit mobile number";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateOtp = () => {
    const errs: typeof fieldErrors = {};
    if (!otpCode.trim()) {
      errs.otpCode = "OTP is required";
    } else if (!/^\d{6}$/.test(otpCode.trim())) {
      errs.otpCode = "Must be exactly 6 digits";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) return;
    setStep("importing");
    setError("");
    try {
      const result = await startPatientImportOTP(patientPhone.trim());
      if (result.success) {
        setStep("otp");
      } else {
        setError(result.error ?? "Failed to send OTP");
        setStep("error");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStep("error");
    }
  };

  const handleImport = async () => {
    if (!validateOtp()) return;
    setStep("importing");
    setError("");
    try {
      const result = await importPatientWithOTP(doctorId, patientPhone.trim(), otpCode.trim());
      if (result.success && result.patientData) {
        setImportedPatient(result.patientData);
        setStep("success");
        onSuccess?.(result.patientData);
      } else {
        setError(result.error ?? "Failed to import patient");
        setStep("error");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStep("error");
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Import Patient">
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <div className={styles.headerIcon}>
              <UserPlus size={18} strokeWidth={1.8} />
            </div>
            <div>
              <p className={styles.modalTitle}>Import Patient</p>
              <p className={styles.modalSub}>Grant secure access with patient OTP</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {step === "input" && (
          <div className={styles.body}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                Registered phone number <span className={styles.labelSub}>(10 digits)</span>
                <span className={styles.req}> *</span>
              </label>
              <input
                type="tel"
                className={`${styles.input} ${fieldErrors.patientPhone ? styles.inputError : ""}`}
                placeholder="e.g. 9876543210"
                value={patientPhone}
                maxLength={10}
                onChange={(e) => {
                  setPatientPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setFieldErrors((p) => ({ ...p, patientPhone: undefined }));
                }}
              />
              {fieldErrors.patientPhone && (
                <span className={styles.fieldError}>
                  <AlertTriangle size={11} /> {fieldErrors.patientPhone}
                </span>
              )}
            </div>

            <div className={styles.infoBox}>
              <Shield size={15} className={styles.infoIcon} />
              <div className={styles.infoContent}>
                <p className={styles.infoTitle}>Patient consent required</p>
                <ul className={styles.infoList}>
                  <li>OTP is sent to the patient&apos;s registered number</li>
                  <li>Previous doctors remain linked for continuity of care</li>
                  <li>The same patient record, analytics, medications, and logs are reused</li>
                  <li>Access grants are recorded in audit logs</li>
                </ul>
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={handleClose}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={handleSendOtp} disabled={!patientPhone}>
                Send OTP
              </button>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className={styles.body}>
            <div className={styles.infoBox}>
              <Phone size={15} className={styles.infoIcon} />
              <div className={styles.infoContent}>
                <p className={styles.infoTitle}>OTP sent</p>
                <p style={{ margin: 0, fontSize: 12, color: "#6d8794" }}>
                  Ask the patient for the 6-digit code to securely grant access.
                </p>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                6-digit OTP <span className={styles.req}> *</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputOtp} ${fieldErrors.otpCode ? styles.inputError : ""}`}
                placeholder="6 digit OTP"
                value={otpCode}
                maxLength={6}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setFieldErrors((p) => ({ ...p, otpCode: undefined }));
                }}
              />
              {fieldErrors.otpCode && (
                <span className={styles.fieldError}>
                  <AlertTriangle size={11} /> {fieldErrors.otpCode}
                </span>
              )}
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={() => setStep("input")}>Back</button>
              <button type="button" className={styles.btnPrimary} onClick={handleImport} disabled={!otpCode}>
                Verify and Import
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className={styles.centeredBody}>
            <div className={styles.spinnerWrap}>
              <Loader2 size={36} className={styles.spinner} />
            </div>
            <p className={styles.centeredTitle}>Importing Patient...</p>
            <p className={styles.centeredSub}>Verifying consent and linking doctor access</p>
            <div className={styles.progressSteps}>
              {["Verifying patient consent", "Checking OTP", "Linking access", "Writing audit log"].map((s, i) => (
                <div key={s} className={styles.progressStep} style={{ animationDelay: `${i * 400}ms` }}>
                  <div className={styles.progressDot} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "success" && importedPatient && (
          <div className={styles.body}>
            <div className={styles.successHeader}>
              <div className={styles.successIcon}>
                <CheckCircle size={28} strokeWidth={1.5} />
              </div>
              <p className={styles.successTitle}>Patient Imported Successfully</p>
              <p className={styles.successSub}>Access granted while preserving previous doctor links</p>
            </div>

            <div className={styles.patientCard}>
              <div className={styles.patientCardRow}>
                <div className={styles.patientAvatar}>
                  {importedPatient.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div className={styles.patientCardInfo}>
                  <p className={styles.patientCardName}>{importedPatient.fullName}</p>
                  <p className={styles.patientCardMeta}>{importedPatient.age}y · {importedPatient.sex} · {importedPatient.condition}</p>
                </div>
                <span className={styles.diagBadge}>{importedPatient.diagnosis.primaryCategory}</span>
              </div>
            </div>

            <div className={styles.nextStepsBox}>
              <p className={styles.nextStepsTitle}>Next Steps</p>
              <ul className={styles.nextStepsList}>
                <li>Review complete medical history and analytics</li>
                <li>Update treatment plans if needed</li>
                <li>Continue monitoring from the same longitudinal patient record</li>
              </ul>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={reset}>Import Another</button>
              <button type="button" className={styles.btnPrimary} onClick={handleClose}>Done</button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className={styles.body}>
            <div className={styles.errorHeader}>
              <div className={styles.errorIcon}>
                <AlertTriangle size={28} strokeWidth={1.5} />
              </div>
              <p className={styles.errorTitle}>Import Failed</p>
              <p className={styles.errorSub}>Unable to import with the provided details</p>
            </div>

            <div className={styles.errorBox}>
              <p className={styles.errorMsg}>{error}</p>
            </div>

            <div className={styles.helpBox}>
              <p className={styles.helpTitle}>Common Issues</p>
              <ul className={styles.helpList}>
                <li>OTP expired - valid for 10 minutes only</li>
                <li>Incorrect registered phone number or OTP</li>
                <li>OTP already used</li>
                <li>Patient already visible in this doctor dashboard</li>
              </ul>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={handleClose}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={reset}>Try Again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
