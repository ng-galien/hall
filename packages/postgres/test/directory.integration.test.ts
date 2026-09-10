import { expect, it } from "vitest";
import { PostgresDirectory, type PostgresDirectoryRequest, type SavePostgresContact } from "../src/directory.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("PostgreSQL council directory", () => {
  const pool = createTestPool();
  const directory = new PostgresDirectory(pool);
  useFreshHallDatabase(pool);

  const request: PostgresDirectoryRequest = {
    role: "hall_api_authenticated",
    context: {
      requestId: "directory-request-1",
      actorId: "actor-1",
      contactId: null,
      roles: ["administrator"],
    },
  };

  const contactInput = (firstName: string, lastName: string): SavePostgresContact => ({
    firstName,
    lastName,
    organizationName: null,
    jobTitle: null,
    email: null,
    phone: null,
    notes: "",
  });

  it("keeps contacts independent from council mandates", async () => {
    await expect(directory.getActiveCouncilTerm(request)).resolves.toBeNull();

    const contact = await directory.createContact(request, contactInput("Ariane", "Martin"));
    expect(contact).toMatchObject({
      firstName: "Ariane",
      lastName: "Martin",
      archivedAt: null,
    });
    expect(contact).not.toHaveProperty("activeCouncilMemberId");

    await expect(directory.listCouncilMembers(request)).resolves.toEqual([]);
    await expect(directory.archiveContact(request, contact.id)).resolves.toMatchObject({
      id: contact.id,
      archivedAt: expect.any(String),
    });
    await expect(directory.listContacts(request)).resolves.toEqual([]);
    await expect(directory.listContacts(request, true)).resolves.toEqual([expect.objectContaining({ id: contact.id })]);
  });

  it("projects normalized council mandates and enforces one active mandate per contact", async () => {
    const term = await directory.configureActiveCouncilTerm(request, 3);
    const contact = await directory.createContact(request, contactInput("Basile", "Durand"));
    const member = await directory.createCouncilMember(request, {
      contactId: contact.id,
      role: "councillor",
      termStartedOn: term.startedOn,
    });

    expect(member).toEqual({
      id: expect.any(String),
      contactId: contact.id,
      councilTermId: term.id,
      rank: null,
      role: "councillor",
      active: true,
      termStartedOn: term.startedOn,
      termEndedOn: null,
    });
    expect(member).not.toHaveProperty("contact");

    await expect(
      directory.createCouncilMember(request, {
        contactId: contact.id,
        role: "deputyMayor",
        termStartedOn: term.startedOn,
      }),
    ).rejects.toMatchObject({
      sqlState: "23505",
      constraint: "council_member_one_active_mandate_per_contact",
    });

    await expect(directory.archiveContact(request, contact.id)).rejects.toMatchObject({ sqlState: "HV803" });

    const ended = await directory.updateCouncilMember(request, member.id, {
      role: member.role,
      termStartedOn: member.termStartedOn,
      termEndedOn: member.termStartedOn,
    });
    expect(ended.active).toBe(false);
    await expect(directory.archiveContact(request, contact.id)).resolves.toMatchObject({
      id: contact.id,
      archivedAt: expect.any(String),
    });
  });

  it("serializes concurrent claims for the last seat in the active term", async () => {
    const term = await directory.configureActiveCouncilTerm(request, 1);
    const first = await directory.createContact(request, contactInput("Claire", "Petit"));
    const second = await directory.createContact(request, contactInput("David", "Robert"));

    const attempts = await Promise.allSettled([
      directory.createCouncilMember(
        { ...request, context: { ...request.context, requestId: "last-seat-1" } },
        { contactId: first.id, role: "mayor", termStartedOn: term.startedOn },
      ),
      directory.createCouncilMember(
        { ...request, context: { ...request.context, requestId: "last-seat-2" } },
        { contactId: second.id, role: "councillor", termStartedOn: term.startedOn },
      ),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { sqlState: "HV805" } });
    await expect(directory.listCouncilMembers(request, true)).resolves.toHaveLength(1);
    await expect(directory.councilMemberCreationAvailable(request)).resolves.toBe(false);
  });

  it("denies directory reads to the anonymous database role", async () => {
    await expect(directory.listContacts({ ...request, role: "hall_api_anonymous" })).rejects.toMatchObject({
      sqlState: "42501",
    });
  });

  it("keeps committee memberships attached to contacts independently from council mandates", async () => {
    const term = await directory.configureActiveCouncilTerm(request, 1);
    const contact = await directory.createContact(request, contactInput("Élise", "Bernard"));
    const member = await directory.createCouncilMember(request, {
      contactId: contact.id,
      role: "councillor",
      termStartedOn: term.startedOn,
    });
    const committee = await directory.createCouncilCommittee(request, {
      name: "Finances",
      description: "Préparation budgétaire",
    });

    const membership = await directory.addCommitteeMembership(request, committee.id, {
      contactId: member.contactId,
      role: "chair",
      startedOn: "2020-01-01",
    });
    expect(membership).toMatchObject({
      committeeId: committee.id,
      contactId: member.contactId,
      role: "chair",
      endedOn: null,
    });
    await expect(
      directory.addCommitteeMembership(request, committee.id, {
        contactId: member.contactId,
        role: "member",
        startedOn: term.startedOn,
      }),
    ).rejects.toMatchObject({
      sqlState: "23505",
      constraint: "committee_membership_one_active_per_member",
    });

    await directory.archiveCouncilCommittee(request, committee.id);
    await expect(directory.listCommitteeMemberships(request, committee.id)).resolves.toEqual([
      expect.objectContaining({ id: membership.id, endedOn: expect.any(String) }),
    ]);
    await expect(
      directory.addCommitteeMembership(request, committee.id, {
        contactId: member.contactId,
        role: "member",
        startedOn: term.startedOn,
      }),
    ).rejects.toMatchObject({ sqlState: "HV821" });

    const secondCommittee = await directory.createCouncilCommittee(request, {
      name: "Culture",
      description: "",
    });
    const secondMembership = await directory.addCommitteeMembership(request, secondCommittee.id, {
      contactId: member.contactId,
      role: "member",
      startedOn: term.startedOn,
    });
    await directory.updateCouncilMember(request, member.id, {
      role: member.role,
      termStartedOn: member.termStartedOn,
      termEndedOn: member.termStartedOn,
    });
    await expect(
      directory.openCommitteeMembership(request, secondCommittee.id, secondMembership.id),
    ).resolves.toMatchObject({
      endedOn: null,
    });
  });
});
