import { describe, it, expect } from "vitest";
import { parseClientsCsvText } from "./csv-clients";

describe("parseClientsCsvText", () => {
  it("parses the documented template columns", () => {
    const csv =
      "Company Name,Contact Name,Contact Email,Contact Phone,Secondary Contact Name,Secondary Contact Email,Secondary Contact Phone,Street Address,Suite,City,State,ZIP,Country,Notes\n" +
      'Acme Corp,Jane Smith,Jane@Acme.com,(510) 555-0100,John Doe,john@acme.com,(510) 555-0101,123 Main St,Suite 400,Hayward,CA,94541,USA,"Key account"\n';
    const { clients, error } = parseClientsCsvText(csv);
    expect(error).toBeUndefined();
    expect(clients).toHaveLength(1);
    const c = clients[0];
    expect(c.company_name).toBe("Acme Corp");
    expect(c.contact_email).toBe("jane@acme.com"); // lowercased
    expect(c.secondary_contact_name).toBe("John Doe");
    expect(c.address_street).toBe("123 Main St");
    expect(c.address_suite).toBe("Suite 400");
    expect(c.address_postal).toBe("94541");
    expect(c.notes).toBe("Key account");
  });

  it("recognizes common CRM header aliases", () => {
    const csv =
      "Account Name,Email,Phone,City,Province,Postal Code\n" +
      "Globex,maria@globex.com,415-555-0142,San Francisco,CA,94103\n";
    const { clients, error } = parseClientsCsvText(csv);
    expect(error).toBeUndefined();
    expect(clients[0].company_name).toBe("Globex");
    expect(clients[0].contact_email).toBe("maria@globex.com");
    expect(clients[0].address_city).toBe("San Francisco");
    expect(clients[0].address_state).toBe("CA");
    expect(clients[0].address_postal).toBe("94103");
  });

  it("requires only a Company Name column", () => {
    const { clients } = parseClientsCsvText("Company Name\nSolo Inc\n");
    expect(clients).toHaveLength(1);
    expect(clients[0].company_name).toBe("Solo Inc");
    expect(clients[0].contact_email).toBeNull();
  });

  it("errors when no company-name column is present", () => {
    const { clients, error } = parseClientsCsvText("Email,Phone\na@b.com,555\n");
    expect(clients).toHaveLength(0);
    expect(error).toMatch(/Company Name/i);
  });

  it("skips blank rows and errors when all rows lack a company name", () => {
    const { error } = parseClientsCsvText("Company Name,Email\n,,\n,x@y.com\n");
    expect(error).toMatch(/No client rows/i);
  });

  it("handles quoted fields with embedded commas and newlines", () => {
    const csv =
      "Company Name,Notes\n" +
      '"Initech, LLC","Two signers required.\nAlways CC legal."\n';
    const { clients } = parseClientsCsvText(csv);
    expect(clients).toHaveLength(1);
    expect(clients[0].company_name).toBe("Initech, LLC");
    expect(clients[0].notes).toContain("Two signers required.");
    expect(clients[0].notes).toContain("Always CC legal.");
  });
});
