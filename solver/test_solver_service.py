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

    def test_monthly_department_requirements_are_solved_per_department(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "senior_1", "worker_type": "senior_doctor", "seniority": 8},
                {"id": "resident_1", "worker_type": "resident", "seniority": 2},
                {"id": "resident_2", "worker_type": "resident", "seniority": 1},
                {"id": "midwife_1", "worker_type": "midwife", "seniority": 5},
            ],
            "shifts": [
                {
                    "id": "delivery_morning",
                    "department_id": "delivery",
                    "arrangement_id": "regular",
                    "shift_date": "2026-05-03",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [
                        {"worker_type": "senior_doctor", "count": 1},
                        {"worker_type": "resident", "count": 1},
                        {"worker_type": "midwife", "count": 1},
                    ],
                },
                {
                    "id": "womens_er_evening",
                    "department_id": "womens_er",
                    "arrangement_id": "regular",
                    "shift_date": "2026-05-03",
                    "start_time": "16:00",
                    "end_time": "23:00",
                    "requirements": [
                        {"worker_type": "resident", "count": 1},
                    ],
                },
            ],
            "constraints": [],
        }

        response = self.client.post("/solve", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["solver_meta"]["monthly_solver_version"], 3)
        self.assertEqual(len(body["assignments"]), 4)
        self.assertEqual(
            {(a["shift_id"], a["department_id"]) for a in body["assignments"]},
            {
                ("delivery_morning", "delivery"),
                ("womens_er_evening", "womens_er"),
            },
        )

    def test_monthly_worker_state_blocks_assignment(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "resident_course", "worker_type": "resident", "seniority": 7},
                {"id": "resident_available", "worker_type": "resident", "seniority": 1},
            ],
            "shifts": [
                {
                    "id": "er_morning",
                    "department_id": "womens_er",
                    "shift_date": "2026-05-04",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "resident", "count": 1}],
                }
            ],
            "worker_states": [
                {
                    "worker_id": "resident_course",
                    "state": "בקורס",
                    "start_time": "2026-05-04T00:00:00+03:00",
                    "end_time": "2026-05-05T00:00:00+03:00",
                }
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["assignments"][0]["worker_id"], "resident_available")

    def test_monthly_seniority_weights_soft_constraint_violations(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "senior_resident", "worker_type": "resident", "seniority": 10},
                {"id": "junior_resident", "worker_type": "resident", "seniority": 1},
            ],
            "shifts": [
                {
                    "id": "delivery_evening",
                    "department_id": "delivery",
                    "shift_date": "2026-05-05",
                    "start_time": "16:00",
                    "end_time": "23:00",
                    "requirements": [{"worker_type": "resident", "count": 1}],
                }
            ],
            "constraints": [
                {
                    "worker_id": "senior_resident",
                    "start_time": "2026-05-05T16:00:00+03:00",
                    "end_time": "2026-05-05T23:00:00+03:00",
                    "priority": "SOFT",
                },
                {
                    "worker_id": "junior_resident",
                    "start_time": "2026-05-05T16:00:00+03:00",
                    "end_time": "2026-05-05T23:00:00+03:00",
                    "priority": "SOFT",
                },
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["assignments"][0]["worker_id"], "junior_resident")
        self.assertEqual(body["solver_meta"]["soft_violations"], 1)
        self.assertEqual(body["solver_meta"]["seniority_penalty"], 1)

    def test_monthly_fairness_balances_workers_of_same_type(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "midwife_1", "worker_type": "midwife", "seniority": 3},
                {"id": "midwife_2", "worker_type": "midwife", "seniority": 2},
            ],
            "shifts": [
                {
                    "id": f"delivery_day_{day}",
                    "department_id": "delivery",
                    "shift_date": f"2026-05-0{day}",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "midwife", "count": 1}],
                }
                for day in range(3, 7)
            ],
            "constraints": [],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        counts = {"midwife_1": 0, "midwife_2": 0}
        for assignment in body["assignments"]:
            counts[assignment["worker_id"]] += 1

        self.assertEqual(counts, {"midwife_1": 2, "midwife_2": 2})
        self.assertEqual(body["solver_meta"]["fairness_imbalance"], 0)

    def test_monthly_same_real_worker_cannot_cover_overlapping_eligibilities(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "u1:senior", "user_id": "u1", "worker_type": "senior", "seniority": 5},
                {"id": "u1:resident", "user_id": "u1", "worker_type": "resident", "seniority": 5},
                {"id": "u2:senior", "user_id": "u2", "worker_type": "senior", "seniority": 1},
                {"id": "u3:resident", "user_id": "u3", "worker_type": "resident", "seniority": 1},
            ],
            "shifts": [
                {
                    "id": "delivery_day",
                    "department_id": "delivery",
                    "arrangement_id": "day",
                    "shift_date": "2026-05-07",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "senior", "count": 1}],
                },
                {
                    "id": "gyn_day",
                    "department_id": "gyn",
                    "arrangement_id": "day",
                    "shift_date": "2026-05-07",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "resident", "count": 1}],
                },
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(len(body["assignments"]), 2)
        self.assertLessEqual(
            sum(1 for assignment in body["assignments"] if assignment["user_id"] == "u1"),
            1,
        )
        self.assertTrue(
            all("solver_worker_id" in assignment for assignment in body["assignments"])
        )

    def test_monthly_soft_worker_state_uses_seniority_weighting(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "senior_midwife", "worker_type": "midwife", "seniority": 9},
                {"id": "junior_midwife", "worker_type": "midwife", "seniority": 1},
            ],
            "shifts": [
                {
                    "id": "delivery_day",
                    "department_id": "delivery",
                    "arrangement_id": "regular",
                    "shift_date": "2026-05-10",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "midwife", "count": 1}],
                }
            ],
            "worker_states": [
                {
                    "worker_id": "senior_midwife",
                    "state": "מבקשת חופש",
                    "date": "2026-05-10",
                },
                {
                    "worker_id": "junior_midwife",
                    "state": "מבקשת חופש",
                    "date": "2026-05-10",
                },
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["assignments"][0]["worker_id"], "junior_midwife")
        self.assertEqual(body["solver_meta"]["soft_state_violations"], 1)
        self.assertEqual(body["solver_meta"]["seniority_penalty"], 1)

    def test_monthly_approved_vacation_state_blocks_assignment(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {"id": "blocked_resident", "worker_type": "resident", "seniority": 2},
                {"id": "available_resident", "worker_type": "resident", "seniority": 1},
            ],
            "shifts": [
                {
                    "id": "gyn_day",
                    "department_id": "gyn",
                    "arrangement_id": "regular",
                    "shift_date": "2026-05-11",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "requirements": [{"worker_type": "resident", "count": 1}],
                }
            ],
            "worker_states": [
                {
                    "worker_id": "blocked_resident",
                    "state": "חופש מאושר",
                    "date": "2026-05-11",
                }
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["assignments"][0]["worker_id"], "available_resident")
        self.assertEqual(body["solver_meta"]["hard_state_blocks"], 1)

    def test_monthly_arrangement_eligibility_is_enforced(self):
        payload = {
            "month": "2026-05",
            "workers": [
                {
                    "id": "night_resident",
                    "worker_type": "resident",
                    "seniority": 2,
                    "department_ids": ["delivery"],
                    "arrangement_ids": ["night"],
                },
                {
                    "id": "day_resident",
                    "worker_type": "resident",
                    "seniority": 1,
                    "department_ids": ["delivery"],
                    "arrangement_ids": ["day"],
                },
            ],
            "shifts": [
                {
                    "id": "delivery_night",
                    "department_id": "delivery",
                    "arrangement_id": "night",
                    "shift_date": "2026-05-12",
                    "start_time": "23:00",
                    "end_time": "08:00",
                    "requirements": [{"worker_type": "resident", "count": 1}],
                }
            ],
        }

        response = self.client.post("/solve-month", json=payload)
        self.assertEqual(response.status_code, 200)

        body = response.get_json()
        self.assertEqual(body["status"], "feasible")
        self.assertEqual(body["assignments"][0]["worker_id"], "night_resident")


if __name__ == "__main__":
    unittest.main()
