# S028 student registration details release

User request: implement the clear items from Yana's SGT message; clarify the meaning of Profession with Yana separately. The clarification was sent and verified. Profession is not implemented pending the answer.

Source c6ed4f941bbfa1ba7a63d7839ab4b9be09d1589d adds department, SNILS, birth date and explicit optional staff identity confirmation to manual registration/import. Source5c76122231ecea82b11966a08066abedf4b4f9b2 adds the group department filter and column. Existing document/FRDO scope is unaffected. Staff authorization and partial-result checks prevent silent success if the backend lacks support.

Validation:60 targeted Vitest tests,34 SQL assertions,Deno check and4-entry semantic TypeScript passed;26 group filter/regression tests passed. Integrated Vite production build passed in1m37s (298 precache entries). Full repository TypeScript was not claimed. Wrapper58 assertions/8 scenarios passed.

Production DB: selected ORIGINAL SINTAGMA, projectd57ddcdf-2d1b-42ec-8bfb-3484123b5ff2/databaseatxwvjxbqjgkbjlhsdch.12/12 preflight checks passed, old department absent,2313 profiles; reviewed owner/student helper hashes matched. Exact wrapper SHA25642bc7b04c65ba17e69b1b025d0649d72f938b6917c48d7825483b3d4ffc75639 executed once. Independent9/9 postchecks passed: exact ledger20260929140000, exact RPCbody, nullabletextdepartment, service-only permissions. No learner writes were made during release. Native provider backup observed29Sep00:33:07UTC, not restored or downloaded.

Next release checkpoints: deploy register-student revisionstudent-details-v4, verify safe unauthenticatedGET returns400/revisionheader before anySDKcalls, confirm Timeweb and real-domain new forms/filter. No actual student account/identification/attempt is created or changed for this check. Evidence maintained at D:/Codex/work/sintagma-queue/ROADMAP.md and work/s028-*.
