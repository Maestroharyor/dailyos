"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Select,
  SelectItem,
  Divider,
  Chip,
} from "@heroui/react";
import { ArrowLeft, Send, Mail, Shield, Check } from "lucide-react";
import { useSpaceActions, useUser, useSpaceInvitations, useCurrentSpace } from "@/lib/stores";
import { PREDEFINED_ROLES, getAllRoles, getAssignableRoles, type RoleId } from "@/lib/types/permissions";
import type { SpaceRole, SpaceInvitation } from "@/lib/stores/space-store";

export default function NewInvitationPage() {
  const router = useRouter();
  const currentUser = useUser();
  const currentSpace = useCurrentSpace();
  const invitations = useSpaceInvitations();
  const { addInvitation } = useSpaceActions();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SpaceRole>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const assignableRoles = getAssignableRoles(currentUser?.roleId || "viewer");
  const selectedRole = PREDEFINED_ROLES[role as keyof typeof PREDEFINED_ROLES];

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    // Check if invitation already exists
    const existingInvitation = invitations.find(
      (inv) => inv.email.toLowerCase() === email.toLowerCase()
    );
    if (existingInvitation) {
      setError("An invitation has already been sent to this email");
      return;
    }

    if (!currentUser) {
      setError("You must be logged in to send invitations");
      return;
    }

    if (!currentSpace) {
      setError("No space selected");
      return;
    }

    setIsSubmitting(true);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create invitation object
    const invitation: SpaceInvitation = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      role: role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      createdAt: new Date().toISOString(),
      invitedBy: { name: currentUser.name },
    };

    addInvitation(invitation);

    setSuccess(true);
    setIsSubmitting(false);

    // Redirect after success
    setTimeout(() => {
      router.push("/system/invitations");
    }, 1500);
  };

  if (success) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24 md:pb-6">
        <Card>
          <CardBody className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Invitation Sent!</h2>
            <p className="text-gray-500 mb-4">
              An invitation has been sent to <strong>{email}</strong>
            </p>
            <p className="text-sm text-gray-400">
              Redirecting to invitations list...
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      {/* Back Button */}
      <Link
        href="/system/invitations"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6"
      >
        <ArrowLeft size={20} />
        <span>Back to Invitations</span>
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold">Invite New User</h1>
        </CardHeader>
        <Divider />
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <Input
                label="Email Address"
                placeholder="user@example.com"
                type="email"
                value={email}
                onValueChange={setEmail}
                startContent={<Mail size={18} className="text-gray-400" />}
                isInvalid={!!error}
                errorMessage={error}
                isRequired
              />
            </div>

            {/* Role Selection */}
            <div>
              <Select
                label="Role"
                selectedKeys={[role]}
                onChange={(e) => setRole(e.target.value as SpaceRole)}
                startContent={<Shield size={18} className="text-gray-400" />}
                isRequired
              >
                {assignableRoles.map((r) => (
                  <SelectItem key={r.id} textValue={r.name}>
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* Role Preview */}
            {selectedRole && (
              <Card className="bg-gray-50 dark:bg-gray-900">
                <CardBody className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Module Access</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedRole.modules.length > 0 ? (
                        selectedRole.modules.map((module) => (
                          <Chip
                            key={module}
                            size="sm"
                            color="primary"
                            variant="flat"
                            className="capitalize"
                          >
                            {module}
                          </Chip>
                        ))
                      ) : (
                        <span className="text-sm text-gray-400">No module access</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Description</p>
                    <p className="text-sm">{selectedRole.description}</p>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                The invited user will receive an email with a link to join your organization.
                The invitation will expire in 7 days.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              color="primary"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
              startContent={!isSubmitting && <Send size={18} />}
            >
              {isSubmitting ? "Sending Invitation..." : "Send Invitation"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
