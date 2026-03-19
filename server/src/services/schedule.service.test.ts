import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleService } from "./schedule.service.js";

test("validateAssignments returns normalized assignments when ids are valid", () => {
  const result = ScheduleService.validateAssignments({
    assignments: [
      { shift_id: 10, user_id: "doctor-1" },
      { shift_id: 10, user_id: "nurse-1" },
    ],
    shifts: [{ id: 10 }],
    users: [{ id: "doctor-1" }, { id: "nurse-1" }],
  });

  assert.deepEqual(result, [
    { shiftId: 10, userId: "doctor-1" },
    { shiftId: 10, userId: "nurse-1" },
  ]);
});

test("validateAssignments throws for unknown shift id", () => {
  assert.throws(
    () =>
      ScheduleService.validateAssignments({
        assignments: [{ shift_id: 999, user_id: "doctor-1" }],
        shifts: [{ id: 10 }],
        users: [{ id: "doctor-1" }],
      }),
    /unknown shift_id 999/,
  );
});

test("validateAssignments throws for unknown user id", () => {
  assert.throws(
    () =>
      ScheduleService.validateAssignments({
        assignments: [{ shift_id: 10, user_id: "ghost-user" }],
        shifts: [{ id: 10 }],
        users: [{ id: "doctor-1" }],
      }),
    /unknown user_id ghost-user/,
  );
});

test("validateAssignments throws for duplicate shift/user assignment", () => {
  assert.throws(
    () =>
      ScheduleService.validateAssignments({
        assignments: [
          { shift_id: 10, user_id: "doctor-1" },
          { shift_id: 10, user_id: "doctor-1" },
        ],
        shifts: [{ id: 10 }],
        users: [{ id: "doctor-1" }],
      }),
    /duplicate assignment 10:doctor-1/,
  );
});
