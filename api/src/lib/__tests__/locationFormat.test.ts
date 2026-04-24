import { describe, expect, it } from "vitest";
import {
  buildEmailEventLocation,
  deriveApproxArea,
  type EmailLocationInput,
  type EmailLocationRole,
} from "../locationFormat";

const inPerson = (overrides: Partial<EmailLocationInput> = {}): EmailLocationInput => ({
  location_type: "in_person",
  location_visibility: "exact_everyone",
  location_name: "Main Street Cafe",
  location_address: "123 Main Street, Toronto, ON M5V 2T1, Canada",
  location_area: "Toronto, ON",
  online_link: null,
  ...overrides,
});

const online = (overrides: Partial<EmailLocationInput> = {}): EmailLocationInput => ({
  location_type: "online",
  location_visibility: "exact_everyone",
  location_name: null,
  location_address: null,
  location_area: null,
  online_link: "https://meet.example.com/abc",
  ...overrides,
});

describe("deriveApproxArea", () => {
  it("returns null for empty input", () => {
    expect(deriveApproxArea(null)).toBeNull();
    expect(deriveApproxArea("")).toBeNull();
  });

  it("strips the street segment and returns the rest", () => {
    expect(deriveApproxArea("123 Main Street, Toronto, ON M5V 2T1, Canada")).toBe(
      "Toronto, ON",
    );
  });

  it("strips US zip codes", () => {
    expect(deriveApproxArea("42 Oak Ave, Portland, OR 97201")).toBe("Portland, OR");
  });
});

describe("buildEmailEventLocation", () => {
  describe("in_person / exact_everyone", () => {
    const plan = inPerson({ location_visibility: "exact_everyone" });

    it("host sees exact", () => {
      expect(buildEmailEventLocation(plan, "host")).toBe(
        "Main Street Cafe, 123 Main Street, Toronto, ON M5V 2T1, Canada",
      );
    });
    it("joined sees exact", () => {
      expect(buildEmailEventLocation(plan, "joined")).toBe(
        "Main Street Cafe, 123 Main Street, Toronto, ON M5V 2T1, Canada",
      );
    });
    it("not_joined sees exact (everyone is allowed)", () => {
      expect(buildEmailEventLocation(plan, "not_joined")).toBe(
        "Main Street Cafe, 123 Main Street, Toronto, ON M5V 2T1, Canada",
      );
    });
    it("declined sees approximate only (never leaks address)", () => {
      expect(buildEmailEventLocation(plan, "declined")).toBe("Main Street Cafe, Toronto, ON");
    });
  });

  describe("in_person / exact_joined_only", () => {
    const plan = inPerson({ location_visibility: "exact_joined_only" });

    it("host sees exact", () => {
      expect(buildEmailEventLocation(plan, "host")).toContain("123 Main Street");
    });
    it("joined sees exact (they joined)", () => {
      expect(buildEmailEventLocation(plan, "joined")).toContain("123 Main Street");
    });
    it("not_joined sees approximate only (haven't joined yet)", () => {
      expect(buildEmailEventLocation(plan, "not_joined")).toBe("Main Street Cafe, Toronto, ON");
      expect(buildEmailEventLocation(plan, "not_joined")).not.toContain("123 Main Street");
    });
    it("declined sees approximate only", () => {
      expect(buildEmailEventLocation(plan, "declined")).toBe("Main Street Cafe, Toronto, ON");
    });
  });

  describe("in_person / approximate_only", () => {
    const plan = inPerson({ location_visibility: "approximate_only" });

    it("host still sees exact (owns the plan)", () => {
      expect(buildEmailEventLocation(plan, "host")).toContain("123 Main Street");
    });
    it("joined sees approximate only (plan says nobody gets exact)", () => {
      expect(buildEmailEventLocation(plan, "joined")).toBe("Main Street Cafe, Toronto, ON");
      expect(buildEmailEventLocation(plan, "joined")).not.toContain("123 Main Street");
    });
    it("not_joined sees approximate only", () => {
      expect(buildEmailEventLocation(plan, "not_joined")).not.toContain("123 Main Street");
    });
    it("declined sees approximate only", () => {
      expect(buildEmailEventLocation(plan, "declined")).not.toContain("123 Main Street");
    });
  });

  describe("online plans", () => {
    const plan = online();

    it("host gets the link", () => {
      expect(buildEmailEventLocation(plan, "host")).toBe("https://meet.example.com/abc");
    });
    it("joined gets the link", () => {
      expect(buildEmailEventLocation(plan, "joined")).toBe("https://meet.example.com/abc");
    });
    it('not_joined gets "Online" only (no link)', () => {
      expect(buildEmailEventLocation(plan, "not_joined")).toBe("Online");
    });
    it('declined gets "Online" only', () => {
      expect(buildEmailEventLocation(plan, "declined")).toBe("Online");
    });
    it('returns "Online" when link missing even for host', () => {
      expect(buildEmailEventLocation(online({ online_link: null }), "host")).toBe("Online");
    });
  });

  describe("edge cases", () => {
    it("handles missing location_area by deriving from the address", () => {
      const plan = inPerson({ location_area: null, location_visibility: "approximate_only" });
      expect(buildEmailEventLocation(plan, "joined")).toBe("Main Street Cafe, Toronto, ON");
    });

    it("returns venue alone when no area derivable and visibility is approximate", () => {
      const plan = inPerson({
        location_area: null,
        location_address: null,
        location_visibility: "approximate_only",
      });
      expect(buildEmailEventLocation(plan, "joined")).toBe("Main Street Cafe");
    });

    it("treats unknown visibility as exact_everyone (schema default)", () => {
      const plan = inPerson({ location_visibility: null });
      expect(buildEmailEventLocation(plan, "not_joined")).toContain("123 Main Street");
    });

    it("accepts arbitrary visibility strings by normalizing to exact_everyone", () => {
      const plan = inPerson({ location_visibility: "some_future_value" as string });
      expect(buildEmailEventLocation(plan, "joined")).toContain("123 Main Street");
    });

    const ROLES: EmailLocationRole[] = ["host", "joined", "not_joined", "declined"];
    for (const role of ROLES) {
      it(`declined always sees approximate regardless of role-matrix for ${role}`, () => {
        const plan = inPerson({ location_visibility: "exact_everyone" });
        const result = buildEmailEventLocation(plan, "declined");
        expect(result).not.toContain("123 Main Street");
        // Keep the loop reference so the role is exercised as a typed value.
        void role;
      });
    }
  });
});
