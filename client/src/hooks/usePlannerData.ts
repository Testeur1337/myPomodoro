import { useCallback, useEffect, useState } from "react";
import { DataClient } from "../utils/dataClient";
import { PlannerDay, RecurringTask, TimeBlockingTemplate } from "../types";

export function usePlannerData(client: DataClient | null, date: string) {
  const [day, setDay] = useState<PlannerDay>({ tasks: [], generatedFromRecurring: false });
  const [recurring, setRecurring] = useState<RecurringTask[]>([]);
  const [templates, setTemplates] = useState<TimeBlockingTemplate[]>([]);

  const load = useCallback(async () => {
    if (!client) return;
    const [d, r, t] = await Promise.all([client.getPlannerDay(date), client.getRecurring(), client.getTemplates()]);
    setDay(d);
    setRecurring(r);
    setTemplates(t);
  }, [client, date]);

  useEffect(() => {
    void load();
  }, [load]);

  return { day, setDay, recurring, setRecurring, templates, setTemplates, reload: load };
}
