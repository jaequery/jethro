import { adminRoute } from "../../../../lib/admin";
import { mostClicked } from "../../../../lib/admin-data";

export const dynamic = "force-dynamic";

// ?range=day|week|month|all (default week)
export const GET = adminRoute((request) => mostClicked(new URL(request.url).searchParams.get("range")));
