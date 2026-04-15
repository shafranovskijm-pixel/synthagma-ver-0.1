import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Download, Printer, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { GeneratedAct } from "@/utils/generateAct";

interface DocumentDialogsProps {
  // Act
  showActDialog: boolean;
  setShowActDialog: (v: boolean) => void;
  actDate: Date;
  setActDate: (d: Date) => void;
  actBasis: string;
  setActBasis: (v: string) => void;
  actAmount: string;
  setActAmount: (v: string) => void;
  actSubmitting: boolean;
  actOtherCustomer: boolean;
  setActOtherCustomer: (v: boolean) => void;
  actCustomerName: string;
  setActCustomerName: (v: string) => void;
  actCustomerInn: string;
  setActCustomerInn: (v: string) => void;
  actCustomerKpp: string;
  setActCustomerKpp: (v: string) => void;
  actCustomerDirector: string;
  setActCustomerDirector: (v: string) => void;
  actCustomerPosition: string;
  setActCustomerPosition: (v: string) => void;
  actInnSearching: boolean;
  onActSearchByInn: (inn: string) => void;
  onGenerateAct: () => void;
  pendingAct: GeneratedAct | null;
  setPendingAct: (v: GeneratedAct | null) => void;
  onSavePendingAct: (action: 'download' | 'print') => void;
  // Invoice
  showInvoiceDialog: boolean;
  setShowInvoiceDialog: (v: boolean) => void;
  invoiceOtherPayer: boolean;
  setInvoiceOtherPayer: (v: boolean) => void;
  invoiceBuyerName: string;
  setInvoiceBuyerName: (v: string) => void;
  invoiceBuyerInn: string;
  setInvoiceBuyerInn: (v: string) => void;
  invoiceBuyerKpp: string;
  setInvoiceBuyerKpp: (v: string) => void;
  innSearching: boolean;
  onSearchByInn: (inn: string) => void;
  generatingInvoice: boolean;
  onGenerateInvoice: () => void;
  pendingInvoice: { html: string; insertData: any; invoiceNum: string; amount: number } | null;
  setPendingInvoice: (v: any) => void;
  onSavePendingInvoice: (action: 'download' | 'print') => void;
}

export function DocumentDialogs(props: DocumentDialogsProps) {
  return (
    <>
      {/* Act Generation Dialog */}
      <Dialog open={props.showActDialog} onOpenChange={props.setShowActDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сформировать акт</DialogTitle>
            <DialogDescription>Акт выполненных работ — предоставление доступа к платформе Sintagma</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Дата акта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !props.actDate && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {props.actDate ? format(props.actDate, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent mode="single" selected={props.actDate} onSelect={(d) => d && props.setActDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Основание (номер договора или счёта)</Label>
              <Input placeholder="Например: Договор №12 от 01.01.2025" value={props.actBasis} onChange={e => props.setActBasis(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Сумма, руб.</Label>
              <Input type="number" placeholder="0.00" value={props.actAmount} onChange={e => props.setActAmount(e.target.value)} min="0" step="0.01" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="actOtherCustomer" checked={props.actOtherCustomer} onChange={e => {
                props.setActOtherCustomer(e.target.checked);
                if (!e.target.checked) { props.setActCustomerName(""); props.setActCustomerInn(""); props.setActCustomerKpp(""); props.setActCustomerDirector(""); props.setActCustomerPosition(""); }
              }} className="rounded border-input" />
              <Label htmlFor="actOtherCustomer" className="text-sm cursor-pointer">Заказчик — другая организация</Label>
            </div>
            {props.actOtherCustomer && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="space-y-2">
                  <Label>ИНН заказчика</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Введите ИНН" value={props.actCustomerInn} onChange={e => props.setActCustomerInn(e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => props.onActSearchByInn(props.actCustomerInn)} disabled={props.actInnSearching || props.actCustomerInn.length < 10}>
                      {props.actInnSearching ? "Поиск..." : "Найти"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2"><Label>Название организации</Label><Input placeholder="ООО «Компания»" value={props.actCustomerName} onChange={e => props.setActCustomerName(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>КПП</Label><Input placeholder="КПП" value={props.actCustomerKpp} onChange={e => props.setActCustomerKpp(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Должность руководителя</Label><Input placeholder="Генеральный директор" value={props.actCustomerPosition} onChange={e => props.setActCustomerPosition(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>ФИО руководителя</Label><Input placeholder="Иванов Иван Иванович" value={props.actCustomerDirector} onChange={e => props.setActCustomerDirector(e.target.value)} /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowActDialog(false)}>Отмена</Button>
            <Button onClick={props.onGenerateAct} disabled={props.actSubmitting || !props.actBasis || !props.actAmount || (props.actOtherCustomer && !props.actCustomerName)}>
              {props.actSubmitting ? "Генерация..." : "Создать акт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Act */}
      <Dialog open={!!props.pendingAct} onOpenChange={() => props.setPendingAct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Акт сформирован</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Акт «{props.pendingAct?.docName}» готов. Выберите действие для сохранения:</p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => props.setPendingAct(null)}>Закрыть без сохранения</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => props.onSavePendingAct('print')}><Printer className="w-4 h-4" />Печать</Button>
            <Button className="gap-1.5" onClick={() => props.onSavePendingAct('download')}><Download className="w-4 h-4" />Скачать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={props.showInvoiceDialog} onOpenChange={props.setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сформировать счёт</DialogTitle>
            <DialogDescription>Счёт на оплату подписки платформы Sintagma</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="otherPayer" checked={props.invoiceOtherPayer} onChange={e => {
                props.setInvoiceOtherPayer(e.target.checked);
                if (!e.target.checked) { props.setInvoiceBuyerName(""); props.setInvoiceBuyerInn(""); props.setInvoiceBuyerKpp(""); }
              }} className="rounded border-input" />
              <Label htmlFor="otherPayer" className="text-sm cursor-pointer">Плательщик — другая организация</Label>
            </div>
            {props.invoiceOtherPayer && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="space-y-2">
                  <Label>ИНН плательщика</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Введите ИНН" value={props.invoiceBuyerInn} onChange={e => props.setInvoiceBuyerInn(e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => props.onSearchByInn(props.invoiceBuyerInn)} disabled={props.innSearching || props.invoiceBuyerInn.length < 10}>
                      {props.innSearching ? "Поиск..." : "Найти"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2"><Label>Название организации</Label><Input placeholder="ООО «Компания»" value={props.invoiceBuyerName} onChange={e => props.setInvoiceBuyerName(e.target.value)} /></div>
                <div className="space-y-2"><Label>КПП</Label><Input placeholder="КПП (необязательно)" value={props.invoiceBuyerKpp} onChange={e => props.setInvoiceBuyerKpp(e.target.value)} /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setShowInvoiceDialog(false)}>Отмена</Button>
            <Button onClick={props.onGenerateInvoice} disabled={props.generatingInvoice || (props.invoiceOtherPayer && !props.invoiceBuyerName)}>
              {props.generatingInvoice ? "Создание..." : "Создать счёт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Invoice */}
      <Dialog open={!!props.pendingInvoice} onOpenChange={() => props.setPendingInvoice(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Счёт сформирован</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Счёт «{props.pendingInvoice?.invoiceNum}» на {props.pendingInvoice?.amount?.toLocaleString("ru-RU")} ₽ готов. Выберите действие для сохранения:
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => props.setPendingInvoice(null)}>Закрыть без сохранения</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => props.onSavePendingInvoice('print')}><Printer className="w-4 h-4" />Печать</Button>
            <Button className="gap-1.5" onClick={() => props.onSavePendingInvoice('download')}><Download className="w-4 h-4" />Скачать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
