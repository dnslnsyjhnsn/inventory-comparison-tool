import React, { useState } from 'react';
import { usePapaParse } from 'react-papaparse';
import './App.css';

interface Product {
    PartNumber: string;
    NTPProductNumber: string;
    LongDescription: string;
    JobberPrice: number;
    Cost: number;
}

interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

interface FilterConfig {
    searchTerm: string;
    column: string;
}

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};

const InventoryComparer: React.FC = () => {
    const { readString } = usePapaParse();
    const [oldFile, setOldFile] = useState<any>(null);
    const [newFile, setNewFile] = useState<any>(null);
    const [message, setMessage] = useState<string>('');
    const [results, setResults] = useState<{
        newProducts: Product[];
        discontinued: Product[];
        priceChanges: any[];
    } | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 50;
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: 'asc' });
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({ searchTerm: '', column: '' });
    const [visibleSections, setVisibleSections] = useState({
        newProducts: false,
        discontinued: false,
        priceChanges: false
    });

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'old' | 'new') => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                readString(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        if (type === 'old') {
                            setOldFile({ ...results, name: file.name });
                        } else {
                            setNewFile({ ...results, name: file.name });
                        }
                    },
                    error: handleOnError
                });
            };
            reader.readAsText(file);
        }
    };

    const handleOnError = (error: Error, file: undefined) => {
        console.error('Error while parsing CSV:', error, file);
        setMessage(`Error parsing CSV: ${error.message}`);
    };

    const compareFiles = () => {
        console.log('Compare button clicked');
        setMessage("Processing files... this may take a few moments.");

        // Use setTimeout to allow the UI to update before heavy processing
        setTimeout(() => {
            try {
                const oldProducts = oldFile?.data || [];
                const newProducts = newFile?.data || [];

                console.log(`Processing ${oldProducts.length} old products and ${newProducts.length} new products`);

                // Create a Map for faster lookups
                const oldProductsMap = new Map(
                    oldProducts
                        .filter((row: any) => {
                            const ntp = row.NTPProductNumber?.replace(/[="]/g, '').trim();
                            return row.PartNumber && ntp !== "";
                        })
                        .map((row: any) => [
                            row.PartNumber?.replace(/[="]/g, '').trim(),
                            {
                                PartNumber: row.PartNumber?.replace(/[="]/g, '').trim() || '',
                                NTPProductNumber: row.NTPProductNumber?.replace(/[="]/g, '').trim() || '',
                                LongDescription: row.LongDescription?.replace(/[="]/g, '').trim() || '',
                                JobberPrice: parseFloat(row.JobberPrice) || 0,
                                Cost: parseFloat(row.Cost) || 0
                            }
                        ])
                );

                const processedNewProducts = newProducts
                    .filter((row: any) => {
                        const ntp = row.NTPProductNumber?.replace(/[="]/g, '').trim();
                        return row.PartNumber && ntp !== "";
                    })
                    .map((row: any) => ({
                        PartNumber: row.PartNumber?.replace(/[="]/g, '').trim() || '',
                        NTPProductNumber: row.NTPProductNumber?.replace(/[="]/g, '').trim() || '',
                        LongDescription: row.LongDescription?.replace(/[="]/g, '').trim() || '',
                        JobberPrice: parseFloat(row.JobberPrice) || 0,
                        Cost: parseFloat(row.Cost) || 0
                    }));

                // Create sets for faster lookups
                const oldPartNumbers = new Set(Array.from(oldProductsMap.keys()));
                const newPartNumbers = new Set(processedNewProducts.map((p: Product) => p.PartNumber));

                // Find new and discontinued items using Set operations
                const newItems = (processedNewProducts as Product[])
                    .filter((product: Product) => !oldPartNumbers.has(product.PartNumber));

                const discontinuedItems = (Array.from(oldProductsMap.values()) as Product[])
                    .filter((product: Product) => {
                        const partNumber = product.PartNumber?.trim();
                        if (!partNumber) {
                            console.warn('PartNumber is undefined or null:', product);
                            return false;
                        }
                        const isDiscontinued = !newPartNumbers.has(partNumber);
                        console.log(`Checking PartNumber: ${partNumber}, isDiscontinued: ${isDiscontinued}`);
                        return isDiscontinued;
                    });

                // Find price changes using Map for O(1) lookups
                const priceChanges = processedNewProducts
                    .filter((newProd: Product) => {
                        const oldProd = oldProductsMap.get(newProd.PartNumber) as Product;
                        return oldProd && (oldProd.JobberPrice !== newProd.JobberPrice || oldProd.Cost !== newProd.Cost);
                    })
                    .map((newProd: Product) => {
                        const oldProd = oldProductsMap.get(newProd.PartNumber) as Product;
                        return {
                            PartNumber: newProd.PartNumber,
                            NTPProductNumber: newProd.NTPProductNumber,
                            LongDescription: newProd.LongDescription,
                            OldJobberPrice: oldProd.JobberPrice,
                            NewJobberPrice: newProd.JobberPrice,
                            PriceDifference: newProd.JobberPrice - oldProd.JobberPrice,
                            OldCost: oldProd.Cost,
                            NewCost: newProd.Cost,
                            CostDifference: newProd.Cost - oldProd.Cost
                        };
                    });

                console.log(`Found ${newItems.length} new items, ${discontinuedItems.length} discontinued items, and ${priceChanges.length} price changes`);

                setResults({
                    newProducts: newItems as Product[],
                    discontinued: discontinuedItems as Product[],
                    priceChanges: priceChanges as any[]
                });

                setMessage(`Comparison complete! Found ${newItems.length} new products, ${discontinuedItems.length} discontinued products, and ${priceChanges.length} price changes.`);
            } catch (error) {
                console.error('Error during comparison:', error);
                setMessage(`Error processing files: ${error}`);
            }
        }, 100); // Small delay to allow UI update
    };

    // Pagination Logic
    const paginate = (array: any[], page_size: number, page_number: number) => {
        return array.slice((page_number - 1) * page_size, page_number * page_size);
    };

    const downloadCSV = (data: any[], filename: string) => {
        const csvContent = "data:text/csv;charset=utf-8," 
            + data.map(e => Object.values(e).map(value => 
                typeof value === 'number' && (String(value).includes('.') || value > 1000)
                    ? formatCurrency(value).replace('$', '') // Remove $ for CSV
                    : value
            ).join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const sortData = (data: any[], config: SortConfig) => {
        if (!config.key) return data;
        
        return [...data].sort((a, b) => {
            if (a[config.key] < b[config.key]) {
                return config.direction === 'asc' ? -1 : 1;
            }
            if (a[config.key] > b[config.key]) {
                return config.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    };

    const filterData = (data: any[], config: FilterConfig) => {
        if (!config.searchTerm) return data;
        
        return data.filter(item => {
            const value = item[config.column]?.toString().toLowerCase();
            return value?.includes(config.searchTerm.toLowerCase());
        });
    };

    const renderTable = (data: any[], columns: string[], title: string, sectionKey: keyof typeof visibleSections) => {
        return (
            <div className="table-section" data-section={sectionKey}>
                <div className="section-header">
                    <div className="section-title" onClick={() => setVisibleSections(prev => ({
                        ...prev,
                        [sectionKey]: !prev[sectionKey]
                    }))}>
                        <span className={`chevron ${visibleSections[sectionKey] ? 'down' : 'right'}`}>
                            ▶
                        </span>
                        <h3>{title}</h3>
                        <span className="count">({data.length})</span>
                    </div>
                    <button onClick={() => downloadCSV(data, `${sectionKey}_${new Date().toISOString().split('T')[0]}`)}>
                        Download All
                    </button>
                </div>
                
                {visibleSections[sectionKey] && (
                    <>
                        <div className="filter-controls">
                            <select 
                                value={filterConfig.column}
                                onChange={(e) => setFilterConfig(prev => ({
                                    ...prev,
                                    column: e.target.value
                                }))}
                            >
                                <option value="">Select Column</option>
                                {columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                placeholder="Search..."
                                value={filterConfig.searchTerm}
                                onChange={(e) => setFilterConfig(prev => ({
                                    ...prev,
                                    searchTerm: e.target.value
                                }))}
                            />
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    {columns.map(column => (
                                        <th key={column} onClick={() => setSortConfig({
                                            key: column,
                                            direction: sortConfig.key === column && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                                        })}>
                                            {column}
                                            {sortConfig.key === column && (
                                                <span>{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginate(sortData(filterData(data, filterConfig), sortConfig), itemsPerPage, currentPage).map((item, index) => (
                                    <tr key={index}>
                                        {columns.map(column => (
                                            <td key={column}>
                                                {column.toLowerCase().includes('price') || column.toLowerCase().includes('cost') 
                                                    ? formatCurrency(item[column])
                                                    : item[column]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="pagination">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>Previous</button>
                            <span>Page {currentPage}</span>
                            <button onClick={() => setCurrentPage(prev => 
                                prev * itemsPerPage < data.length ? prev + 1 : prev
                            )}>Next</button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="container">
            <h1>Inventory Comparison Tool</h1>
            <div className="upload-section">
                <div className="file-input-container">
                    <h2>Old Inventory File</h2>
                    <div className="file-input-wrapper">
                        <input
                            type="file"
                            id="old-file"
                            accept=".csv"
                            onChange={(e) => handleFileUpload(e, 'old')}
                        />
                        <label htmlFor="old-file">
                            {oldFile?.meta?.fields ? 
                                "File uploaded successfully" 
                                : "Click to upload or drag and drop CSV file"}
                        </label>
                    </div>
                </div>
                <div className="file-input-container">
                    <h2>New Inventory File</h2>
                    <div className="file-input-wrapper">
                        <input
                            type="file"
                            id="new-file"
                            accept=".csv"
                            onChange={(e) => handleFileUpload(e, 'new')}
                        />
                        <label htmlFor="new-file">
                            {newFile?.meta?.fields ? 
                                "File uploaded successfully" 
                                : "Click to upload or drag and drop CSV file"}
                        </label>
                    </div>
                </div>
            </div>
            <button onClick={compareFiles}>Compare Files</button>
            {message && <p>{message}</p>}
            
            {results && (
                <div className="results">
                    <h2>Results:</h2>
                    {results.newProducts.length > 0 && renderTable(
                        results.newProducts,
                        ['PartNumber', 'NTPProductNumber', 'LongDescription', 'JobberPrice', 'Cost'],
                        'New Products',
                        'newProducts'
                    )}
                    
                    {results.discontinued.length > 0 && renderTable(
                        results.discontinued,
                        ['PartNumber', 'NTPProductNumber', 'LongDescription', 'JobberPrice', 'Cost'],
                        'Discontinued Products',
                        'discontinued'
                    )}
                    
                    {results.priceChanges.length > 0 && renderTable(
                        results.priceChanges,
                        ['PartNumber', 'NTPProductNumber', 'OldJobberPrice', 'NewJobberPrice', 'PriceDifference'],
                        'Price Changes',
                        'priceChanges'
                    )}
                </div>
            )}
        </div>
    );
};

export default InventoryComparer; 