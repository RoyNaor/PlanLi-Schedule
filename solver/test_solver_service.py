import unittest

from solver_service import app


class SolverServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def _base_payload(self):
        return {
            "week_start": "2026-03-01",
            "users": [
                {"id": "doctor_1", "role": "doctor"},
                {"id": "nurse_1", "role": "nurse"},
            ],
            "shifts": [
                {
                    "id": 1,
                    "shift_date": "2026-03-01",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "min_doctors": 1,
                    "min_nurses": 1,
                }
            ],
            "constraints": [],
        }

    def test_solve_returns_feasible_assignments(self):
        response = self.client.post("/solve", json=self._base_payload())
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(len(body["assignments"]), 2)
        self.assertIn("solver_meta", body)
        self.assertIn("objective_value", body["solver_meta"])

    def test_solve_returns_infeasible_when_nurse_coverage_not_possible(self):
        payload = self._base_payload()
        payload["users"] = [{"id": "doctor_1", "role": "doctor"}]
        payload["shifts"][0]["min_nurses"] = 1

        response = self.client.post("/solve", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "infeasible")
        self.assertEqual(body["assignments"], [])
        self.assertIn("message", body)

    def test_hard_constraint_blocks_assignment_and_can_make_problem_infeasible(self):
        payload = self._base_payload()
        payload["constraints"] = [
            {
                "id": "hard_1",
                "user_id": "nurse_1",
                "start_time": "2026-03-01T08:00:00+02:00",
                "end_time": "2026-03-01T16:00:00+02:00",
                "priority": "HARD",
            }
        ]

        response = self.client.post("/solve", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "infeasible")
        self.assertEqual(body["assignments"], [])

    def test_soft_constraint_can_be_violated_when_coverage_requires_it(self):
        payload = self._base_payload()
        payload["constraints"] = [
            {
                "id": "soft_1",
                "user_id": "nurse_1",
                "start_time": "2026-03-01T08:00:00+02:00",
                "end_time": "2026-03-01T16:00:00+02:00",
                "priority": "SOFT",
            }
        ]

        response = self.client.post("/solve", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertGreaterEqual(body["solver_meta"]["soft_violations"], 1)

    def test_solve_supports_labor_ward_staff_roles(self):
        payload = self._base_payload()
        payload["users"] = [
            {"id": "midwife_1", "role": "midwife"},
            {"id": "obgyn_1", "role": "obgyn"},
            {"id": "anesthesiologist_1", "role": "anesthesiologist"},
            {"id": "orderly_1", "role": "orderly"},
            {"id": "pediatrician_1", "role": "pediatrician"},
            {"id": "scribe_1", "role": "shabbat_scribe"},
            {"id": "secretary_1", "role": "secretary"},
        ]
        payload["shifts"][0].update(
            {
                "min_doctors": 0,
                "min_nurses": 0,
                "min_midwives": 1,
                "min_obgyns": 1,
                "min_anesthesiologists": 1,
                "min_orderlies": 1,
                "min_pediatricians": 1,
                "min_shabbat_scribes": 1,
                "min_secretaries": 1,
            }
        )

        response = self.client.post("/solve", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(
            {assignment["user_id"] for assignment in body["assignments"]},
            {user["id"] for user in payload["users"]},
        )


if __name__ == "__main__":
    unittest.main()
