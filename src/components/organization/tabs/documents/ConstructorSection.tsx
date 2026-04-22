import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Building2, FileText, ScrollText, Award, UserCheck, Stamp, Lightbulb, ExternalLink, Eye, Users, FileStack } from "lucide-react";
import { OrgRequisitesForm } from "@/components/organization/OrgRequisitesForm";
import { ProtocolTemplateEditor } from "@/components/organization/ProtocolTemplateEditor";
import { CertificateTemplateEditor } from "@/components/organization/CertificateTemplateEditor";
import { ConsentGenerator } from "@/components/organization/ConsentGenerator";
import { StampSignatureUploader } from "@/components/organization/StampSignatureUploader";
import { DocumentPreview } from "@/components/organization/DocumentPreview";
import { ContractLegalFaq } from "@/components/organization/ContractLegalFaq";
import { OrgSignatoriesManager } from "@/components/organization/OrgSignatoriesManager";
import { BulkDocumentGenerator } from "@/components/organization/BulkDocumentGenerator";

interface ConstructorSectionProps {
  organizationId: string;
  organizationName?: string;
  constructorTab: string;
  setConstructorTab: (v: string) => void;
  stampUrl: string | null;
  signatureUrl: string | null;
  onStampUpload: (url: string) => void;
  onSignatureUpload: (url: string) => void;
  onStampRemove: () => void;
  onSignatureRemove: () => void;
  onOpenContractEditor: () => void;
}

export function ConstructorSection({
  organizationId, organizationName, constructorTab, setConstructorTab,
  stampUrl, signatureUrl, onStampUpload, onSignatureUpload, onStampRemove, onSignatureRemove,
  onOpenContractEditor,
}: ConstructorSectionProps) {
  return (
    <div className="relative">
      <Tabs value={constructorTab} onValueChange={setConstructorTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl mb-4">
          <TabsTrigger value="requisites" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><Building2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Реквизиты</span></TabsTrigger>
          <TabsTrigger value="contract" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Договор</span></TabsTrigger>
          <TabsTrigger value="protocol" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><ScrollText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Протокол АК</span></TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><Award className="w-3.5 h-3.5" /><span className="hidden sm:inline">Удост./Диплом</span></TabsTrigger>
          <TabsTrigger value="consent" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><UserCheck className="w-3.5 h-3.5" /><span className="hidden sm:inline">Согласие ПД</span></TabsTrigger>
          <TabsTrigger value="stamp" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><Stamp className="w-3.5 h-3.5" /><span className="hidden sm:inline">Печать</span></TabsTrigger>
          <TabsTrigger value="signatories" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><Users className="w-3.5 h-3.5" /><span className="hidden sm:inline">Подписанты</span></TabsTrigger>
          <TabsTrigger value="info" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5"><Lightbulb className="w-3.5 h-3.5" /><span className="hidden sm:inline">Справка</span></TabsTrigger>
        </TabsList>

        <TabsContent value="requisites" className="mt-0 space-y-4">
          <OrgRequisitesForm organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="contract" className="mt-0">
          <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-1">Конструктор шаблона договора</h4>
              <p className="text-xs text-muted-foreground max-w-sm">Полноэкранный редактор с подсветкой переменных, панелью вставки и предпросмотром</p>
            </div>
            <Button className="rounded-xl gap-2" onClick={onOpenContractEditor}>
              <ExternalLink className="w-4 h-4" />
              Открыть конструктор
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="protocol" className="mt-0">
          <ProtocolTemplateEditor organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <CertificateTemplateEditor organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="consent" className="mt-0">
          <ConsentGenerator organizationId={organizationId} organizationName={organizationName || ""} />
        </TabsContent>

        <TabsContent value="stamp" className="mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <StampSignatureUploader type="stamp" currentUrl={stampUrl} onUpload={onStampUpload} onRemove={onStampRemove} organizationId={organizationId} />
            <StampSignatureUploader type="signature" currentUrl={signatureUrl} onUpload={onSignatureUpload} onRemove={onSignatureRemove} organizationId={organizationId} />
          </div>
          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="preview" className="border border-border rounded-xl px-4">
              <AccordionTrigger className="text-sm hover:no-underline">
                <span className="flex items-center gap-2"><Eye className="w-4 h-4" />Предпросмотр документа</span>
              </AccordionTrigger>
              <AccordionContent>
                <DocumentPreview type="certificate" data={{}} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        <TabsContent value="signatories" className="mt-0">
          <OrgSignatoriesManager organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="info" className="mt-0">
          <ContractLegalFaq />
        </TabsContent>
      </Tabs>
    </div>
  );
}
