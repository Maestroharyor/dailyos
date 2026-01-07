"use client";

import { Card, CardBody, Button, Chip } from "@heroui/react";
import { FileText, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function InvoicesPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="overflow-visible">
        <CardBody className="py-16 px-8 text-center">
          {/* Icon */}
          <div className="relative inline-block mb-6">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto">
              <FileText size={48} className="text-white" />
            </div>
            <Chip
              size="sm"
              color="warning"
              variant="solid"
              className="absolute -top-2 -right-2"
            >
              Coming Soon
            </Chip>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold mb-2">Invoices</h1>
          <p className="text-default-500 mb-8 max-w-md mx-auto">
            Create professional invoices, track payments, and manage your
            billing all in one place. This feature is currently under
            development.
          </p>

          {/* Features Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-left max-w-lg mx-auto">
            <FeatureItem title="Create Invoices" description="Design and send professional invoices" />
            <FeatureItem title="Track Payments" description="Monitor paid and pending invoices" />
            <FeatureItem title="Client Management" description="Store client details and history" />
            <FeatureItem title="PDF Export" description="Download invoices as PDF files" />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/">
              <Button
                variant="bordered"
                startContent={<ArrowLeft size={18} />}
              >
                Back to Dashboard
              </Button>
            </Link>
            <Button
              color="primary"
              startContent={<Bell size={18} />}
              isDisabled
            >
              Notify Me When Ready
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Additional Info */}
      <p className="text-center text-sm text-default-400 mt-6">
        We&apos;re working hard to bring you this feature. Stay tuned for updates!
      </p>
    </div>
  );
}

function FeatureItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-default-100">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-default-500">{description}</p>
    </div>
  );
}
