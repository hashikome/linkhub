import type { ValidationIssue, ValidationRule } from "@linkhub/types";
import { getMetadataStorage, type ValidationError } from "class-validator";
import { appError } from "./app-exception";

const rules: Record<string, ValidationRule> = {
  isDefined: "required",
  isNotEmpty: "required",
  isString: "string",
  isInt: "integer",
  isBoolean: "boolean",
  isArray: "array",
  isEmail: "email",
  isUrl: "url",
  isUuid: "uuid",
  min: "minimum",
  max: "maximum",
  minLength: "min_length",
  maxLength: "max_length",
  matches: "format",
  isIn: "choice",
  arrayMinSize: "min_items",
  arrayMaxSize: "max_items",
  arrayUnique: "unique_items",
  nestedValidation: "nested",
  whitelistValidation: "unknown_field",
};
export function validationException(errors: ValidationError[]) {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  function visit(rows: ValidationError[], parent = "", depth = 0) {
    if (depth > 8) return;
    for (const row of rows) {
      if (issues.length >= 32) return;
      const fields =
        row.target && !Array.isArray(row.target)
          ? getMetadataStorage().getTargetValidationMetadatas(
              row.target.constructor,
              "",
              false,
              false,
            )
          : [];
      const declared = fields.some((field) => field.propertyName === row.property);
      const segment = declared
        ? row.property
        : Array.isArray(row.target) && /^\d+$/.test(row.property)
          ? "*"
          : "$";
      const field = parent ? `${parent}.${segment}` : segment;
      for (const key of Object.keys(row.constraints ?? {})) {
        const rule = rules[key] ?? "invalid";
        const identity = `${field}:${rule}`;
        if (issues.length < 32 && !seen.has(identity)) {
          seen.add(identity);
          issues.push({ field, rule });
        }
      }
      if (row.children?.length) visit(row.children, field, depth + 1);
    }
  }
  visit(errors);
  return appError("validation_failed", { issues });
}
