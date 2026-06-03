import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));
vi.mock("@/data/pushSubscriptions", () => ({
  currentState: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

import { toast } from "sonner";

import { NotificationOptIn } from "@/components/NotificationOptIn";
import { currentState, subscribe, unsubscribe } from "@/data/pushSubscriptions";

const mockCurrent = vi.mocked(currentState);
const mockSubscribe = vi.mocked(subscribe);
const mockUnsubscribe = vi.mocked(unsubscribe);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationOptIn", () => {
  it("shows the enable button when unsubscribed and subscribes on click", async () => {
    mockCurrent.mockResolvedValue("unsubscribed");
    mockSubscribe.mockResolvedValue("subscribed");
    render(<NotificationOptIn />);

    const btn = await screen.findByRole("button", { name: "Activer les notifications" });
    await userEvent.click(btn);

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: "Désactiver les notifications" });
    expect(toast.success).toHaveBeenCalledWith("Notifications activées", expect.anything());
  });

  it("shows the disable button when subscribed and unsubscribes on click", async () => {
    mockCurrent.mockResolvedValue("subscribed");
    mockUnsubscribe.mockResolvedValue("unsubscribed");
    render(<NotificationOptIn />);

    const btn = await screen.findByRole("button", { name: "Désactiver les notifications" });
    await userEvent.click(btn);

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: "Activer les notifications" });
    expect(toast.success).toHaveBeenCalledWith("Notifications désactivées", expect.anything());
  });

  it("renders iOS install guidance (no button, no subscribe) when unsupported", async () => {
    mockCurrent.mockResolvedValue("unsupported");
    render(<NotificationOptIn />);

    expect(await screen.findByText(/écran d'accueil/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("renders blocked-permission guidance when denied", async () => {
    mockCurrent.mockResolvedValue("denied");
    render(<NotificationOptIn />);

    expect(await screen.findByText(/bloquées/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("surfaces a denied result from the enable click as an error toast", async () => {
    mockCurrent.mockResolvedValue("unsubscribed");
    mockSubscribe.mockResolvedValue("denied");
    render(<NotificationOptIn />);

    await userEvent.click(await screen.findByRole("button", { name: "Activer les notifications" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Notifications refusées", expect.anything()));
  });
});
