import { describe, expect, it } from "vitest";
import {
  buildEmailEventLocation,
  deriveApproxArea,
  joinNameAndAddress,
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

describe("joinNameAndAddress", () => {
  it("returns empty when both inputs are missing", () => {
    expect(joinNameAndAddress(null, null)).toBe("");
    expect(joinNameAndAddress("", "")).toBe("");
    expect(joinNameAndAddress(undefined, undefined)).toBe("");
  });

  it("returns the populated side when only one is present", () => {
    expect(joinNameAndAddress("Cafe", null)).toBe("Cafe");
    expect(joinNameAndAddress(null, "123 Main St")).toBe("123 Main St");
  });

  it("returns once when both sides are equal", () => {
    expect(joinNameAndAddress("123 Main St", "123 Main St")).toBe("123 Main St");
  });

  it("returns address alone when address starts with the name (plain street pick)", () => {
    expect(joinNameAndAddress("123 Main St", "123 Main St, Toronto, ON")).toBe(
      "123 Main St, Toronto, ON",
    );
  });

  it("returns name alone when name already ends with the address (combined-display row)", () => {
    // Reproduces the Add/Edit form storing the autocomplete display string in
    // location_name while location_address holds the formatted address. The
    // previous join produced two copies of the postal address.
    const name = "Gamers Emporium, 1634 Hyde Park Rd, London, ON N6H 0L5, Canada";
    const address = "1634 Hyde Park Rd, London, ON N6H 0L5, Canada";
    expect(joinNameAndAddress(name, address)).toBe(name);
  });

  it("joins distinct name and address with a comma", () => {
    expect(joinNameAndAddress("Main Street Cafe", "123 Main Street, Toronto, ON")).toBe(
      "Main Street Cafe, 123 Main Street, Toronto, ON",
    );
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(joinNameAndAddress("  Cafe  ", "  Cafe, Toronto  ")).toBe("Cafe, Toronto");
  });
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
    it("declined sees approximate only (never leaks address or venue)", () => {
      // Area only since Aug 2026: the venue name identifies the exact place
      // and the create form stores combined "venue, address" strings in
      // location_name, so including it leaked the street address.
      expect(buildEmailEventLocation(plan, "declined")).toBe("Toronto, ON");
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
    it("not_joined sees the bare area only (haven't joined yet)", () => {
      expect(buildEmailEventLocation(plan, "not_joined")).toBe("Toronto, ON");
      expect(buildEmailEventLocation(plan, "not_joined")).not.toContain("Main Street");
    });
    it("declined sees the bare area only", () => {
      expect(buildEmailEventLocation(plan, "declined")).toBe("Toronto, ON");
    });
  });

  describe("in_person / approximate_only", () => {
    const plan = inPerson({ location_visibility: "approximate_only" });

    it("host still sees exact (owns the plan)", () => {
      expect(buildEmailEventLocation(plan, "host")).toContain("123 Main Street");
    });
    it("joined sees the bare area only (plan says nobody gets exact)", () => {
      expect(buildEmailEventLocation(plan, "joined")).toBe("Toronto, ON");
      expect(buildEmailEventLocation(plan, "joined")).not.toContain("Main Street");
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
      expect(buildEmailEventLocation(plan, "joined")).toBe("Toronto, ON");
    });

    it("returns empty when no area derivable and visibility is approximate", () => {
      const plan = inPerson({
        location_area: null,
        location_address: null,
        location_visibility: "approximate_only",
      });
      // Better an empty location (callers hide the row) than the venue name,
      // which identifies the exact place the setting exists to protect.
      expect(buildEmailEventLocation(plan, "joined")).toBe("");
    });

    it("does not duplicate the address when location_name already contains it", () => {
      // The Add/Edit forms currently store the autocomplete's combined
      // display string in location_name. Without dedupe, emails would read
      // "Venue, 123 Main St, City, Venue, 123 Main St, City". The shared
      // joinNameAndAddress helper collapses the overlap.
      const plan = inPerson({
        location_name: "Gamers Emporium, 1634 Hyde Park Rd, London, ON N6H 0L5, Canada",
        location_address: "1634 Hyde Park Rd, London, ON N6H 0L5, Canada",
        location_area: "London, ON",
      });
      expect(buildEmailEventLocation(plan, "host")).toBe(
        "Gamers Emporium, 1634 Hyde Park Rd, London, ON N6H 0L5, Canada",
      );
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
