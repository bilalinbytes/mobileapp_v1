"use client";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enPatient from "../public/locales/en/patient.json";
import hiPatient from "../public/locales/hi/patient.json";

i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { patient: enPatient },
      hi: { patient: hiPatient },
    },
    lng: "en",
    fallbackLng: "en",
    ns: ["patient"],
    defaultNS: "patient",
    interpolation: {
      escapeValue: false, // React already safe from xss
    },
  });

export default i18next;
