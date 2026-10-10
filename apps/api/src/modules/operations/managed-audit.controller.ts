import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuditLogQueryDto } from "../../common/dto/audit-query.dto";
import { AuthGuard } from "../../common/guards/auth.guard";
import { apiOk } from "../../common/utils/response.util";
import { OperationsService, type OperatorRequest } from "./operations.service";

@UseGuards(AuthGuard)
@Controller("api/v1/manage/audit")
export class ManagedAuditController {
  constructor(private readonly operations: OperationsService) {}
  @Get()
  async list(@Req() req: OperatorRequest, @Query() query: AuditLogQueryDto) {
    const result = await this.operations.managedAudit(req, query);
    return apiOk(result.items, result.meta);
  }
}
