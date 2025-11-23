import { useState } from 'react';
import { useSubscriptionStorage } from './useSubscriptionStorage';
import { useRSSVideos } from './useRSSVideos';
import { toast } from 'sonner';

export function useBulkOperations() {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const { removeSubscription } = useSubscriptionStorage();
    const { refresh } = useRSSVideos({ channelIds: [], autoRefresh: false });

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    const selectAll = (ids: string[]) => {
        setSelectedIds(ids);
    };

    const clearSelection = () => {
        setSelectedIds([]);
    };

    const bulkDelete = async () => {
        if (selectedIds.length === 0) {
            toast.error('No channels selected');
            return;
        }

        const count = selectedIds.length;
        // Remove each subscription individually
        for (const id of selectedIds) {
            await removeSubscription(id);
        }
        toast.success(`Deleted ${count} channel${count > 1 ? 's' : ''}`);
        clearSelection();
        setIsSelectionMode(false);
    };

    const bulkRefresh = async () => {
        if (selectedIds.length === 0) {
            toast.error('No channels selected');
            return;
        }

        toast.info(`Refreshing ${selectedIds.length} channels...`);
        await refresh();
        toast.success('Channels refreshed');
    };

    return {
        selectedIds,
        isSelectionMode,
        setIsSelectionMode,
        toggleSelection,
        selectAll,
        clearSelection,
        bulkDelete,
        bulkRefresh,
    };
}
