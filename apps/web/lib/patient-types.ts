export interface PatientData {
  id: string;
  fullName: string;
  age: number;
  sex: "Male" | "Female" | "Other";
  mobileNumber: string;
  emailId: string;
  diagnosis: {
    primaryCategory: string;
    subtype?: string;
  };
  condition: string;
  lastDoctor?: string;
}
