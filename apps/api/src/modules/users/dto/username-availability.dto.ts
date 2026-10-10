import { IsString, MaxLength } from "class-validator";
export class UsernameAvailabilityDto {
  @IsString()
  @MaxLength(255)
  username!: string;
}
