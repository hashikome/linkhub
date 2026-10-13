import { formNavigationResponse } from "../../../lib/form-navigation";
import { startImport } from "../../../lib/import-forms";
export async function POST(request: Request) {
  return formNavigationResponse(request, await startImport(request));
}
