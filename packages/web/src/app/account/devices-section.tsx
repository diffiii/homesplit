"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ListSkeleton } from "@/components/list-skeleton";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { account } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { queryKeys } from "@/lib/api/query-keys";
import { formatLocalDate } from "@/lib/dates";
import { describeUserAgent } from "@/lib/user-agent";

type Session = Awaited<ReturnType<typeof account.listSessions>>[number];

const sessionsQuery = () => ({
  queryKey: queryKeys.sessions(),
  queryFn: account.listSessions,
});

/** This device first, then the most recently active. */
function sortSessions(sessions: Session[], currentSessionId: string) {
  return sessions.toSorted(
    (a, b) =>
      Number(b.id === currentSessionId) - Number(a.id === currentSessionId) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      a.id.localeCompare(b.id)
  );
}

interface DevicesSectionProps {
  /** The session this page runs in, which can't be signed out from the list. */
  currentSessionId: string;
}

/** Where the user is signed in, with a way to sign out the other devices. */
export function DevicesSection({ currentSessionId }: DevicesSectionProps) {
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
  const others =
    sessions.data?.filter(({ id }) => id !== currentSessionId) ?? [];

  return (
    <section aria-labelledby="devices-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-base" id="devices-heading">
          Signed-in devices
        </h2>
        <p className="text-muted-foreground text-sm">
          Sign out of any device you don't recognize, then change your password.
        </p>
      </div>
      <QueryState
        errorTitle="Couldn't load your devices"
        query={sessions}
        skeleton={<ListSkeleton label="Loading your devices" rows={2} />}
      >
        {(data) => (
          <ul className="flex flex-col divide-y rounded-xl border">
            {sortSessions(data, currentSessionId).map((session) => (
              <DeviceRow
                current={session.id === currentSessionId}
                key={session.id}
                onSignedOut={refetch}
                session={session}
              />
            ))}
          </ul>
        )}
      </QueryState>
      {others.length > 0 ? (
        <div>
          <ConfirmDialog
            confirmLabel="Sign out"
            description="Anyone using HomeSplit on them has to sign in again. This device stays signed in."
            onConfirm={async () => {
              try {
                await account.revokeOtherSessions();
              } finally {
                await refetch();
              }
            }}
            title={
              others.length === 1
                ? "Sign out of the other device?"
                : `Sign out of ${others.length} other devices?`
            }
            trigger={
              <Button variant="outline">
                <LogOutIcon aria-hidden data-icon="inline-start" />
                Sign out of all other devices
              </Button>
            }
          />
        </div>
      ) : null}
    </section>
  );
}

interface DeviceRowProps {
  current: boolean;
  onSignedOut: () => Promise<unknown>;
  session: Session;
}

function DeviceRow({ session, current, onSignedOut }: DeviceRowProps) {
  const { label, mobile } = describeUserAgent(session.userAgent);
  const Icon = mobile ? SmartphoneIcon : MonitorIcon;
  const signOut = useMutation({
    mutationFn: () => account.revokeSession({ token: session.token }),
    onSuccess: onSignedOut,
    onError: (error) => {
      toast.error(`Couldn't sign out ${label}. ${errorMessage(error)}`);
    },
  });
  const details = [
    session.ipAddress,
    `Signed in ${formatLocalDate(session.createdAt)}`,
    current ? null : `Last active ${formatLocalDate(session.updatedAt)}`,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {label}
          {current ? <Badge variant="secondary">This device</Badge> : null}
        </span>
        <span className="text-muted-foreground text-sm">
          {details.join(" · ")}
        </span>
      </div>
      {current ? null : (
        <Button
          aria-label={`Sign out ${label}`}
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
          size="sm"
          variant="ghost"
        >
          {signOut.isPending ? <Spinner data-icon="inline-start" /> : null}
          Sign out
        </Button>
      )}
    </li>
  );
}
