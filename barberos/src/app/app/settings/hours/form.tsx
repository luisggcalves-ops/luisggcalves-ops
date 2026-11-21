"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { OpeningHoursEditor } from "@/components/shop/opening-hours-editor";
import type { OpeningInterval } from "@/lib/validation/shop";
import { updateOpeningHoursAction } from "../actions";

export function OpeningHoursForm({ hours, timezone }: { hours: OpeningInterval[]; timezone: string }) {
  const { state, onSubmit, pending } = useFormAction(updateOpeningHoursAction);
  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader
          title="Opening hours"
          description={`When customers can visit. Times are in ${timezone.replaceAll("_", " ")}. Use “Split” for a lunch break.`}
        />
        <CardBody>
          <OpeningHoursEditor name="openingHours" defaultValue={hours} />
        </CardBody>
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto">
            Save hours
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
