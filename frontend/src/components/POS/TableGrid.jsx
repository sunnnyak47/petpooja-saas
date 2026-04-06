import React, { useState } from 'react';
import { Users, Clock, ArrowRight, CheckCircle2, AlertCircle, Ban } from 'lucide-react';

/**
 * TableGrid - A visual representation of the restaurant's floor plan.
 * Color codes:
 * - Available: Emerald (Success)
 * - Occupied: Blue (Brand)
 * - Dirty: Amber (Warning)
 * - Reserved: Purple (Info)
 * - Blocked: Red (Error)
 */
const TableGrid = ({ tables, areas, onTableClick, selectedAreaId, onAreaChange }) => {
  const filteredTables = selectedAreaId 
    ? tables.filter(t => t.area_id === selectedAreaId) 
    : tables;

  const getStatusConfig = (status) => {
    switch (status) {
      case 'available':
        return { 
          bg: 'bg-emerald-500/10', 
          border: 'border-emerald-500/50', 
          text: 'text-emerald-400',
          icon: <CheckCircle2 className="w-4 h-4" />,
          label: 'Available'
        };
      case 'occupied':
        return { 
          bg: 'bg-brand-500/10', 
          border: 'border-brand-500/50', 
          text: 'text-brand-400',
          icon: <ArrowRight className="w-4 h-4" />,
          label: 'Occupied'
        };
      case 'dirty':
        return { 
          bg: 'bg-amber-500/10', 
          border: 'border-amber-500/50', 
          text: 'text-amber-400',
          icon: <AlertCircle className="w-4 h-4" />,
          label: 'Cleaning'
        };
      case 'reserved':
        return { 
          bg: 'bg-purple-500/10', 
          border: 'border-purple-500/50', 
          text: 'text-purple-400',
          icon: <Clock className="w-4 h-4" />,
          label: 'Reserved'
        };
      default:
        return { 
          bg: 'bg-surface-800', 
          border: 'border-surface-700', 
          text: 'text-surface-500',
          icon: <Ban className="w-4 h-4" />,
          label: 'Blocked'
        };
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Area Selector Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        <button 
          onClick={() => onAreaChange(null)}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shadow-sm
            ${!selectedAreaId ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface-800 text-surface-400 border-surface-700 hover:bg-surface-700 border'}`}
        >
          All Areas
        </button>
        {areas.map(area => (
          <button 
            key={area.id}
            onClick={() => onAreaChange(area.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shadow-sm
              ${selectedAreaId === area.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface-800 text-surface-400 border-surface-700 hover:bg-surface-700 border'}`}
          >
            {area.name}
          </button>
        ))}
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto pr-2 no-scrollbar">
        {filteredTables.map(table => {
          const config = getStatusConfig(table.status);
          const currentOrder = table.orders?.[0];

          return (
            <button
              key={table.id}
              onClick={() => onTableClick(table)}
              className={`relative group h-32 rounded-3xl border-2 p-4 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-brand-500/10
                ${config.bg} ${config.border} hover:scale-[1.02] active:scale-[0.98]`}
            >
              {/* Background Glow */}
              <div className={`absolute -right-4 -top-4 w-16 h-16 blur-2xl opacity-20 transition-all group-hover:scale-150 ${config.bg}`} />
              
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-white leading-none mb-1">{table.table_number}</h3>
                  <div className="flex items-center gap-1.5 opacity-60">
                    <Users className="w-3 h-3" />
                    <span className="text-[10px] font-bold">{table.seating_capacity} Seats</span>
                  </div>
                </div>
                <div className={`${config.text}`}>
                  {config.icon}
                </div>
              </div>

              <div className="mt-auto">
                {currentOrder ? (
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] font-black tracking-tighter text-white opacity-40 uppercase">₹ {currentOrder.grand_total}</span>
                    <span className="text-[9px] font-bold text-white leading-tight truncate w-full text-left line-clamp-1 italic">Order: {currentOrder.order_number}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${table.status === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-surface-600'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-wider ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Hover Action HUD */}
              <div className="absolute inset-0 bg-brand-500 opacity-0 group-hover:opacity-10 transition-opacity" />
            </button>
          );
        })}
      </div>

      {/* Legend / Info Bar */}
      <div className="mt-8 pt-6 border-t border-surface-800 flex items-center justify-between">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
            <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-brand-500/20 border border-brand-500/50" />
            <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
            <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Cleaning</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500/20 border border-purple-500/50" />
            <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Reserved</span>
          </div>
        </div>
        <div className="text-[10px] font-bold text-surface-500 uppercase tracking-widest bg-surface-800 px-3 py-1 rounded-full">
          Total Tables: {tables.length}
        </div>
      </div>
    </div>
  );
};

export default TableGrid;
