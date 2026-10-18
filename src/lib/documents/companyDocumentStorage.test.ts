import { describe, expect, it } from "vitest";
import { companyDocumentStorage } from "./companyDocumentStorage";
describe("company document private bucket routing", () => {
  it("routes an uploaded company file to its private bucket", () => {
    expect(companyDocumentStorage({ company_id: "company", file_path: "company/file.pdf" })).toEqual({ bucket: "company-documents", path: "company/file.pdf" });
  });
  it("preserves generated billing documents", () => {
    expect(companyDocumentStorage({ company_id: "company", file_path: "organization/bulk/file.pdf" })?.bucket).toBe("billing-documents");
  });
  it("recognizes legacy locators but does not turn arbitrary external URLs into Storage paths", () => {
    expect(companyDocumentStorage({ company_id: "company", file_url: "https://project.invalid/storage/v1/object/public/company-documents/company/a.pdf" })?.bucket).toBe("company-documents");
    expect(companyDocumentStorage({ company_id: "company", file_url: "https://external.invalid/report" })).toBeNull();
  });
  it.each(["company-documents", "billing-documents"])("re-authorizes expired signed and authenticated %s locators", bucket => {
    for (const mode of ["sign", "authenticated"]) {
      const locator = `https://project.invalid/storage/v1/object/${mode}/${bucket}/company/file.pdf?token=old-expired`;
      expect(companyDocumentStorage({ company_id: "company", file_url: locator })).toEqual({ bucket, path: locator });
    }
  });
  it("does not recognize a bucket marker hidden in an external query string or another bucket", () => {
    expect(companyDocumentStorage({ company_id: "company", file_url: "https://external.invalid/report?next=/object/public/company-documents/company/file.pdf" })).toBeNull();
    expect(companyDocumentStorage({ company_id: "company", file_url: "https://project.invalid/storage/v1/object/public/student-documents/user/file.pdf" })).toBeNull();
  });
});
