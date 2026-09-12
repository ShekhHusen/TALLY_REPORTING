const fs = require('fs');
const content = fs.readFileSync('src/components/FollowUpsTab.jsx', 'utf-8');

const startIdx = content.indexOf(`                const statusColors = {`);
const endIdx = content.indexOf(`              })`, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const prefix = content.slice(0, startIdx);
    const suffix = content.slice(endIdx);
    const newContent = `                const statusStyles = {
                  'Today': { label: 'Due Today', color: 'bg-amber-100 text-amber-900 border-amber-300', stripe: 'bg-amber-500', icon: <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> },
                  'Overdue': { label: 'Overdue', color: 'bg-red-100 text-red-800 border-red-200', stripe: 'bg-red-500', icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> },
                  'Upcoming': { label: 'Upcoming', color: 'bg-blue-100 text-blue-800 border-blue-200', stripe: 'bg-blue-500', icon: <Calendar className="w-3.5 h-3.5 mr-1 text-blue-600" /> },
                  'Completed': { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', stripe: 'bg-green-500', icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> },
                  'Pending': { label: 'Pending', color: 'bg-gray-100 text-gray-800 border-gray-200', stripe: 'bg-gray-400', icon: <Clock className="w-3.5 h-3.5 mr-1 text-gray-600" /> }
                };
                const currentStyle = statusStyles[status] || statusStyles['Pending'];

                return (
                  <div key={fu.id} className="bg-white border border-gray-100 rounded-xl shadow-sm relative overflow-hidden transition-all hover:shadow-md mb-3">
                    {/* Color stripe on the left */}
                    <div className={\`absolute left-0 top-0 bottom-0 w-1.5 \${currentStyle.stripe}\`}></div>
                    
                    <div className="p-4 pl-5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-2.5">
                          <span className={\`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border \${currentStyle.color}\`}>
                            {currentStyle.icon}
                            {currentStyle.label}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-gray-500 flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100 shrink-0">
                          <User className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[80px]">{fu.userName}</span>
                        </div>
                      </div>

                      {/* Account Name */}
                      <h4 className="font-extrabold text-sm text-gray-900 leading-tight mb-2 truncate" title={fu.accountName}>
                        {fu.accountName}
                      </h4>
                      
                      {/* Message */}
                      <div className="text-gray-800 text-sm font-medium leading-relaxed whitespace-pre-wrap line-clamp-3">
                        {fu.message}
                      </div>

                      {/* Latest Call Info if present */}
                      {fu.lastCallNote && (
                        <div className="mt-3 text-[11px] text-blue-900 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex items-start gap-2">
                          <PhoneCall className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-blue-800">Latest Call:</span> <span className="font-medium text-gray-700">{fu.lastCallNote}</span>{' '}
                            <span className="text-blue-600 font-bold block mt-0.5">({fu.lastCallBy || 'User'} on {fu.lastCallDate})</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Footer: Next Date, Assigned, and Action buttons */}
                      <div className={\`mt-4 pt-3 border-t border-gray-100 flex \${fu.completed ? 'flex-col' : 'flex-wrap items-start justify-between'} gap-3 text-xs text-gray-600\`}>
                        {!fu.completed && (
                          <div className="flex items-center gap-4 w-full">
                            {fu.nextFollowUpDate && (
                              <div className="flex flex-col flex-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Next Follow-up</span>
                                <b className="text-blue-700 text-xs mt-0.5">{fu.nextFollowUpDate}</b>
                              </div>
                            )}
                            {fu.assignedTo && (
                              <div className="flex flex-col flex-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned To</span>
                                <span className="font-bold text-gray-700 text-xs mt-0.5 truncate">{fu.assignedTo}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className={\`grid \${fu.completed ? 'grid-cols-2 gap-2 w-full' : 'grid-cols-4 gap-1.5 w-full'}\`}>
                          {!fu.completed && (
                            <button
                              type="button"
                              onClick={() => handleOpenUpdate(fu)}
                              className="py-1.5 px-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate"
                              title="Reschedule"
                            >
                              <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate hidden sm:inline">Resched.</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenUpdate(fu)}
                            className={\`\${fu.completed ? 'col-span-1 px-3 py-2' : 'py-1.5 px-1'} bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate\`}
                            title="History"
                          >
                            <History className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                            <span className="truncate hidden sm:inline">History</span>
                            <span className="bg-white border border-gray-200 text-gray-700 text-[9px] px-1 rounded-full font-black shrink-0">{historyCount}</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleOpenStatement(fu.accountName)}
                            className={\`\${fu.completed ? 'col-span-1 px-3 py-2' : 'py-1.5 px-1'} bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate\`}
                            title="Statement"
                          >
                             <FileText className="w-3.5 h-3.5 shrink-0" />
                             <span className="truncate hidden sm:inline">Stmt</span>
                          </button>
                          {!fu.completed && (
                            <button
                              type="button"
                              onClick={() => handleMarkComplete(fu)}
                              className="py-1.5 px-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate"
                              title="Complete"
                            >
                               <Check className="w-3.5 h-3.5 shrink-0" />
                               <span className="truncate hidden sm:inline">Complete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
`;
    fs.writeFileSync('src/components/FollowUpsTab.jsx', prefix + newContent + suffix);
    console.log("Successfully replaced content.");
} else {
    console.log("Could not find start or end index.");
}
