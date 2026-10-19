"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, HouseIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { useAppForm } from "@/components/form";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/responsive-dialog";
import { householdPath } from "@/components/shell/household-nav";
import { UserMenu } from "@/components/shell/household-shell";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { households } from "@/lib/api/auth-client";
import { householdQueries } from "@/lib/api/household-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { applyServerErrors } from "@/lib/form";

/** Households the user belongs to. The dashboard and switcher epic replaces this. */
export default function HomePage() {
  const list = useQuery(householdQueries.list());

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-end gap-1 px-2">
        <ThemeMenu />
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-10"
        id="main"
      >
        <PageHeader
          actions={list.data?.length ? <CreateHouseholdDialog /> : undefined}
          title="Your households"
        />
        <QueryState
          query={list}
          skeleton={<ListSkeleton label="Loading households" rows={3} />}
        >
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                action={<CreateHouseholdDialog />}
                description="Create one and invite the people you live with."
                icon={HouseIcon}
                title="No households yet"
              />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {data.map((household) => (
                  <li key={household.id}>
                    <Link
                      className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      href={householdPath(household.id)}
                    >
                      <HouseIcon
                        aria-hidden
                        className="size-5 text-muted-foreground"
                      />
                      <span className="flex-1 truncate font-medium">
                        {household.name}
                      </span>
                      <ChevronRightIcon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </main>
    </div>
  );
}

const CreateHouseholdValues = z.object({
  name: z.string().trim().min(1, "Give the household a name."),
});

function CreateHouseholdDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({ mutationFn: households.create });
  const form = useAppForm({
    defaultValues: { name: "" },
    validators: { onSubmit: CreateHouseholdValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        const household = await create.mutateAsync({ name: value.name.trim() });
        if (!household) {
          throw new Error("Better Auth created no household");
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.households(),
        });
        setOpen(false);
        router.push(householdPath(household.id));
      } catch (error) {
        applyServerErrors(formApi, error);
      }
    },
  });

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
        }
      }}
      open={open}
    >
      <ResponsiveDialogTrigger
        render={
          <Button>
            <PlusIcon aria-hidden data-icon="inline-start" />
            New household
          </Button>
        }
      />
      <ResponsiveDialogContent>
        <form.AppForm>
          <form.Form className="contents">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>New household</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                You'll be its owner and can invite others afterwards.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-4">
              <form.AppField name="name">
                {(field) => <field.TextField autoComplete="off" label="Name" />}
              </form.AppField>
              <form.FormError />
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose render={<Button variant="outline" />}>
                Cancel
              </ResponsiveDialogClose>
              <form.SubmitButton>Create</form.SubmitButton>
            </ResponsiveDialogFooter>
          </form.Form>
        </form.AppForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
